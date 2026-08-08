import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  debitTokens,
  releaseDailySpend,
  checkUserRateLimit,
  TOKENS_PER_CLIP,
  CLIP_USD_ESTIMATE,
} from '@/lib/tokens'

/**
 * Start (or resume) generation for a project.
 *
 * Creates the whole job graph up front — one image job per photo that still
 * needs reframing, one clip job per clip — then hands the image work to the
 * compute service. Clips start 'waiting' and are dispatched later, as their two
 * images land, by the webhook.
 *
 * Resume-aware: the server derives the starting clip index from what has already
 * succeeded. The client sends no offset, so a replayed request cannot re-generate
 * clips that are already paid for.
 */

type ReadyClip = {
  clip_job_id: string
  order_index: number
  start_still_s3_key: string
  end_still_s3_key: string
}

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

    const { projectId } = await request.json()
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const videoServiceUrl = process.env.VIDEO_SERVICE_URL
    if (!videoServiceUrl) {
      return NextResponse.json({ error: 'Video service not configured' }, { status: 503 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, aspect_ratio')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // ---- Confirm gate -------------------------------------------------------
    const { data: photos } = await supabase
      .from('photos')
      .select('id, s3_key, order_index')
      .eq('project_id', projectId)
      .eq('selected', true)
      .order('order_index', { ascending: true })

    if (!photos || photos.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 confirmed photos required.' },
        { status: 403 }
      )
    }

    if (await checkUserRateLimit(user.id)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    const db = serviceClient()

    // ---- Where to resume from ----------------------------------------------
    // Server owns the offset: one past the highest clip that has already
    // succeeded. Nothing the client sends can move it.
    const { data: lastDone } = await db
      .from('clip_jobs')
      .select('order_index')
      .eq('project_id', projectId)
      .eq('status', 'succeeded')
      .eq('is_current', true)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle()

    const start = lastDone ? lastDone.order_index + 1 : 0
    const totalClips = photos.length - 1

    if (start >= totalClips) {
      return NextResponse.json({ error: 'All clips already generated.' }, { status: 409 })
    }

    // ---- How many we can afford --------------------------------------------
    const { data: account } = await db
      .from('token_accounts')
      .select('balance_tokens')
      .eq('user_id', user.id)
      .single()

    const balance = account?.balance_tokens ?? 0
    const affordable = Math.floor(balance / TOKENS_PER_CLIP)
    const end = Math.min(start + affordable, totalClips)

    if (end <= start) {
      return NextResponse.json(
        { error: 'insufficient_balance', balance, required: TOKENS_PER_CLIP },
        { status: 402 }
      )
    }

    // ---- Image jobs for the stills clips [start..end) need -------------------
    // Clip i is built from stills i and i+1, so the range needs stills
    // [start..end] — end-start+1 of them, because each interior still is shared
    // by two clips and must only ever be generated once.
    const neededIndexes: number[] = []
    for (let i = start; i <= end; i++) neededIndexes.push(i)

    const photoByIndex = new Map(photos.map((p) => [p.order_index as number, p]))

    // A photo that already has a reframe row is done — skip it rather than pay
    // to reframe it again.
    const { data: existingReframes } = await db
      .from('reframes')
      .select('photo_id, s3_key')
      .eq('project_id', projectId)

    const reframeByPhotoId = new Map(
      (existingReframes ?? []).map((r) => [r.photo_id as string, r.s3_key as string])
    )

    const imageJobsToRun: {
      image_job_id: string
      photo_s3_key: string
      order_index: number
    }[] = []

    const { data: existingImageJobs } = await db
      .from('image_jobs')
      .select('id, photo_id, status')
      .eq('project_id', projectId)

    const imageJobByPhotoId = new Map(
      (existingImageJobs ?? []).map((j) => [j.photo_id as string, j])
    )

    for (const idx of neededIndexes) {
      const photo = photoByIndex.get(idx)
      if (!photo) continue

      const existing = imageJobByPhotoId.get(photo.id)

      // Never re-enqueue a reframe that is already done or in flight. Blindly
      // upserting to 'queued' here would let a double-click reset a running job
      // and pay to reframe the same photo twice.
      if (existing) {
        if (existing.status !== 'failed') continue

        await db
          .from('image_jobs')
          .update({ status: 'queued', error_message: null })
          .eq('id', existing.id)

        imageJobsToRun.push({
          image_job_id: existing.id,
          photo_s3_key: photo.s3_key,
          order_index: idx,
        })
        continue
      }

      // A photo with a reframe row but no job row (an older run) is already done.
      const alreadyReframed = reframeByPhotoId.has(photo.id)

      const { data: imageJob } = await db
        .from('image_jobs')
        .insert({
          project_id: projectId,
          photo_id: photo.id,
          order_index: idx,
          status: alreadyReframed ? 'succeeded' : 'queued',
        })
        .select('id')
        .single()

      if (!imageJob || alreadyReframed) continue

      imageJobsToRun.push({
        image_job_id: imageJob.id,
        photo_s3_key: photo.s3_key,
        order_index: idx,
      })
    }

    // ---- Clip jobs: debit, then create --------------------------------------
    const created: { clipJobId: string; orderIndex: number }[] = []
    let stoppedEarly: 'insufficient' | 'ceiling' | null = null

    for (let i = start; i < end; i++) {
      const idempotencyKey = `clip:${projectId}:${i}`

      const { data: existing } = await db
        .from('clip_jobs')
        .select('id, status')
        .eq('project_id', projectId)
        .eq('order_index', i)
        .eq('is_current', true)
        .maybeSingle()

      // Slot already has a live job — idempotent re-submit, nothing to charge.
      if (existing && existing.status !== 'failed') {
        created.push({ clipJobId: existing.id, orderIndex: i })
        continue
      }

      // A previously failed clip is retried on the ORIGINAL debit: its
      // idempotency key is already spent, so inserting a new row would violate
      // the unique index, and charging again would bill twice for one clip.
      // (The USD reservation was released when it failed and is not re-made —
      // the ceiling stays protective for new work, and actual_usd still records
      // the real spend when this one completes.)
      if (existing) {
        await db
          .from('clip_jobs')
          .update({ status: 'waiting', error_message: null })
          .eq('id', existing.id)

        created.push({ clipJobId: existing.id, orderIndex: i })
        continue
      }

      // Balance guard + USD reservation, one transaction. Debit BEFORE creating
      // the job so an unaffordable clip is never enqueued.
      const debit = await debitTokens(user.id, TOKENS_PER_CLIP, 'generation', {
        idempotencyKey,
        usdEstimate: CLIP_USD_ESTIMATE,
      })

      if (debit.status === 'insufficient') {
        stoppedEarly = 'insufficient'
        break
      }
      if (debit.status === 'ceiling_exceeded') {
        stoppedEarly = 'ceiling'
        break
      }

      const { data: clipJob, error: clipErr } = await db
        .from('clip_jobs')
        .insert({
          project_id: projectId,
          order_index: i,
          dep_start_index: i,
          dep_end_index: i + 1,
          status: 'waiting',
          cost_tokens: TOKENS_PER_CLIP,
          cost_usd_estimate: CLIP_USD_ESTIMATE,
          idempotency_key: idempotencyKey,
        })
        .select('id')
        .single()

      if (clipErr || !clipJob) {
        // Debited but no job to show for it: give the USD headroom back. The
        // tokens stay debited — the ledger is append-only and has no refund.
        await releaseDailySpend(CLIP_USD_ESTIMATE)
        console.error(`Failed to create clip job ${i}:`, clipErr)
        break
      }

      if (debit.status === 'ok') {
        await db
          .from('token_transactions')
          .update({ job_id: clipJob.id })
          .eq('idempotency_key', idempotencyKey)
      }

      created.push({ clipJobId: clipJob.id, orderIndex: i })
    }

    if (created.length === 0) {
      return NextResponse.json(
        { error: stoppedEarly === 'ceiling' ? 'daily_limit_reached' : 'insufficient_balance', balance },
        { status: stoppedEarly === 'ceiling' ? 503 : 402 }
      )
    }

    // ---- Clips whose stills already exist can go straight out ---------------
    // Normal first run: none. Resume where every needed still was already
    // produced: all of them.
    const readyClips: ReadyClip[] = []
    for (const idx of neededIndexes) {
      const { data: released } = await db.rpc('satisfy_clip_dependencies', {
        p_project_id: projectId,
        p_order_index: idx,
      })

      for (const row of (released ?? []) as {
        clip_job_id: string
        order_index: number
        dep_start_index: number
        dep_end_index: number
      }[]) {
        const startKey = reframeByPhotoId.get(photoByIndex.get(row.dep_start_index)?.id ?? '')
        const endKey = reframeByPhotoId.get(photoByIndex.get(row.dep_end_index)?.id ?? '')
        if (!startKey || !endKey) continue

        readyClips.push({
          clip_job_id: row.clip_job_id,
          order_index: row.order_index,
          start_still_s3_key: startKey,
          end_still_s3_key: endKey,
        })
      }
    }

    // ---- Hand off to the compute service ------------------------------------
    const dispatch = await fetch(`${videoServiceUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GENERATION_WEBHOOK_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        aspect_ratio: project.aspect_ratio || '16:9',
        image_jobs: imageJobsToRun,
        ready_clips: readyClips,
      }),
    }).catch((err) => {
      console.error('Dispatch to compute service failed:', err)
      return null
    })

    if (!dispatch || !dispatch.ok) {
      const reason = !dispatch
        ? 'Compute service unreachable'
        : `Compute service returned ${dispatch.status}`

      await db
        .from('image_jobs')
        .update({ status: 'failed', error_message: reason })
        .in('id', imageJobsToRun.map((j) => j.image_job_id))

      await db
        .from('clip_jobs')
        .update({ status: 'failed', error_message: reason })
        .in('id', created.map((c) => c.clipJobId))

      return NextResponse.json({ error: reason }, { status: 502 })
    }

    return NextResponse.json({
      projectId,
      clips: created,
      imagesQueued: imageJobsToRun.length,
      totalClips,
      generated: created.length,
      remaining: totalClips - (start + created.length),
      // Drives the top-up prompt — shown only after the user has seen clips land.
      needsTopUp: start + created.length < totalClips,
    })
  } catch (error: unknown) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
