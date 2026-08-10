import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  debitTokens,
  releaseDailySpend,
  checkUserRateLimit,
  tokensForDuration,
  reserveUsdForDuration,
} from '@/lib/tokens'

/**
 * Generate one slot.
 *
 * The agent sets a clip up, generates it, looks at it, and moves on. There is no
 * batch, no derived sequence, and nothing waits on another slot — a slot needs
 * only its own one or two photos, so the whole generation is a single task.
 *
 * A still never reaches here: it has no model call, costs nothing, and is ready
 * the moment it has a photo.
 */

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slotId } = await request.json()
    if (!slotId) {
      return NextResponse.json({ error: 'slotId required' }, { status: 400 })
    }

    const videoServiceUrl = process.env.VIDEO_SERVICE_URL
    if (!videoServiceUrl) {
      return NextResponse.json({ error: 'Compute service not configured' }, { status: 503 })
    }

    const db = serviceClient()

    const { data: slot } = await db
      .from('slots')
      .select('*, projects!inner(id, user_id, aspect_ratio)')
      .eq('id', slotId)
      .single()

    if (!slot) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
    }

    const project = (slot as unknown as {
      projects: { id: string; user_id: string; aspect_ratio: string }
    }).projects

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
    }

    if (slot.kind === 'still') {
      return NextResponse.json(
        { error: 'A still doesn’t need generating — it’s ready as soon as it has a photo.' },
        { status: 400 }
      )
    }

    if (!slot.start_photo_id) {
      return NextResponse.json(
        { error: 'Choose a photo for this clip first.' },
        { status: 400 }
      )
    }

    // Already running. Returning the existing take rather than starting another
    // is what stops a double-click costing twice.
    const { data: inFlight } = await db
      .from('clip_jobs')
      .select('id, status')
      .eq('slot_id', slotId)
      .in('status', ['queued', 'running'])
      .maybeSingle()

    if (inFlight) {
      return NextResponse.json({ takeId: inFlight.id, status: inFlight.status, alreadyRunning: true })
    }

    if (await checkUserRateLimit(user.id)) {
      return NextResponse.json({ error: 'Too many clips at once. Try again shortly.' }, { status: 429 })
    }

    // Resolve the photos this slot needs. The worker reframes whichever lack a
    // still; a photo already reframed — including one shared with another slot —
    // is reused, which is why reframes is unique per photo.
    const photoIds = [slot.start_photo_id, slot.end_photo_id].filter(Boolean) as string[]

    const { data: photos } = await db
      .from('photos')
      .select('id, s3_key')
      .in('id', photoIds)

    if (!photos || photos.length !== photoIds.length) {
      return NextResponse.json({ error: 'Those photos are no longer available.' }, { status: 409 })
    }

    const byId = new Map(photos.map((p) => [p.id, p.s3_key]))

    // The still the worker needs may already exist. Every reframe is recorded
    // here as it lands, so hand over the key and let the worker download it
    // instead of paying Gemini to produce the same image twice.
    //
    // Without this the reuse path upstream could never fire: it keys off
    // reframed_s3_key, and nothing populated it. Regenerating a slot — the
    // central gesture of the authored model — re-bought its stills every take.
    const { data: stills } = await db
      .from('reframes')
      .select('photo_id, s3_key')
      .in('photo_id', photoIds)

    const stillByPhoto = new Map((stills ?? []).map((r) => [r.photo_id, r.s3_key]))

    // A crop fallback is reused like any other still. It is what the reframe
    // produced and what the last take was cut from, so re-running it here would
    // silently charge for a retry nobody asked for and change the slot's look
    // between takes that were meant to differ only by what the agent altered.
    const framePayload = (photoId: string) => ({
      id: photoId,
      s3_key: byId.get(photoId),
      reframed_s3_key: stillByPhoto.get(photoId) ?? null,
    })

    const cost = tokensForDuration(slot.duration_seconds)
    const reserve = reserveUsdForDuration(slot.duration_seconds)

    // A fresh key per attempt: regenerating is a deliberate purchase, not a
    // replay. Double-submits are caught by the in-flight check above.
    const idempotencyKey = `slot:${slotId}:${Date.now()}`

    const debit = await debitTokens(user.id, cost, 'generation', {
      idempotencyKey,
      usdEstimate: reserve,
    })

    if (debit.status === 'insufficient') {
      return NextResponse.json(
        { error: 'insufficient_balance', balance: debit.balance, required: cost },
        { status: 402 }
      )
    }
    if (debit.status === 'ceiling_exceeded') {
      return NextResponse.json({ error: 'daily_limit_reached' }, { status: 503 })
    }

    // The new take supersedes the old one, which stays as history and can be
    // switched back to instantly.
    await db
      .from('clip_jobs')
      .update({ is_current: false, superseded_at: new Date().toISOString() })
      .eq('slot_id', slotId)
      .eq('is_current', true)

    const params = {
      start_photo_id: slot.start_photo_id,
      end_photo_id: slot.end_photo_id,
      camera_motion: slot.camera_motion,
      motion_aggression: slot.motion_aggression,
      duration_seconds: slot.duration_seconds,
    }

    const { data: take, error: takeError } = await db
      .from('clip_jobs')
      .insert({
        project_id: project.id,
        slot_id: slotId,
        status: 'queued',
        duration_seconds: slot.duration_seconds,
        cost_tokens: cost,
        cost_usd_estimate: reserve,
        idempotency_key: idempotencyKey,
        is_current: true,
        params,
      })
      .select('id')
      .single()

    if (takeError || !take) {
      await releaseDailySpend(reserve)
      console.error('Create take failed:', takeError)
      return NextResponse.json({ error: 'Could not start generating' }, { status: 500 })
    }

    await db
      .from('token_transactions')
      .update({ job_id: take.id })
      .eq('idempotency_key', idempotencyKey)

    const dispatch = await fetch(`${videoServiceUrl}/generate-slot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GENERATION_WEBHOOK_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        clip_job_id: take.id,
        slot_id: slotId,
        project_id: project.id,
        aspect_ratio: project.aspect_ratio || '16:9',
        duration_seconds: slot.duration_seconds,
        camera_motion: slot.camera_motion,
        motion_aggression: slot.motion_aggression,
        start_photo: framePayload(slot.start_photo_id),
        end_photo: slot.end_photo_id ? framePayload(slot.end_photo_id) : null,
      }),
    }).catch((err) => {
      console.error('Dispatch failed:', err)
      return null
    })

    if (!dispatch || !dispatch.ok) {
      const reason = !dispatch
        ? 'Compute service unreachable'
        : `Compute service returned ${dispatch.status}`

      // Nothing was generated, so the reservation has to come back. Tokens
      // deliberately do not — retry is the mitigation, same as any other
      // failure — but reserved_usd is the day's best-known spend, and a clip
      // the box never accepted did not spend anything.
      await releaseDailySpend(reserve)

      await db
        .from('clip_jobs')
        .update({ status: 'failed', error_message: reason })
        .eq('id', take.id)

      return NextResponse.json({ error: reason }, { status: 502 })
    }

    return NextResponse.json({
      takeId: take.id,
      slotId,
      status: 'queued',
      costTokens: cost,
      durationSeconds: slot.duration_seconds,
    })
  } catch (error: unknown) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
