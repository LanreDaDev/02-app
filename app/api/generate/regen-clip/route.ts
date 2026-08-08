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
 * Re-generate a single clip.
 *
 * Runs FFLF again from the two reframed stills that already exist — no reframe,
 * no image jobs. The new clip supersedes the old one in its slot rather than
 * mutating it, so the timeline always has exactly one live clip per index.
 *
 * Pre-finalize only. Costs the same 400 tokens as a first generation.
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

    const { projectId, clipJobId } = await request.json()
    if (!projectId || !clipJobId) {
      return NextResponse.json(
        { error: 'projectId and clipJobId required' },
        { status: 400 }
      )
    }

    const videoServiceUrl = process.env.VIDEO_SERVICE_URL
    if (!videoServiceUrl) {
      return NextResponse.json({ error: 'Compute service not configured' }, { status: 503 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, aspect_ratio')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const db = serviceClient()

    // Once a render exists the composition is locked — regenerating a clip would
    // silently diverge the delivered video from what the user downloaded.
    const { data: existingVideo } = await db
      .from('videos')
      .select('id, status')
      .eq('project_id', projectId)
      .maybeSingle()

    if (existingVideo && existingVideo.status !== 'failed') {
      return NextResponse.json(
        { error: 'Cannot regenerate a clip after finalizing.' },
        { status: 409 }
      )
    }

    const { data: clipJob } = await db
      .from('clip_jobs')
      .select('id, order_index, dep_start_index, dep_end_index, status')
      .eq('id', clipJobId)
      .eq('project_id', projectId)
      .eq('is_current', true)
      .maybeSingle()

    if (!clipJob) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
    }

    if (clipJob.status === 'queued' || clipJob.status === 'running') {
      return NextResponse.json({ error: 'Clip is already generating.' }, { status: 409 })
    }

    if (await checkUserRateLimit(user.id)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })
    }

    // Resolve the two stills by their dependency indices. Both must already
    // exist — that is the whole reason a regen is cheaper than a fresh run.
    const stills = await stillsByIndex(db, projectId)
    const startKey = stills.get(clipJob.dep_start_index)
    const endKey = stills.get(clipJob.dep_end_index)

    if (!startKey || !endKey) {
      return NextResponse.json(
        { error: 'Reframed stills for this clip are missing. Re-run generation.' },
        { status: 409 }
      )
    }

    // Unique per attempt, so a double-click can't buy two regenerations while
    // still blocking a genuine replay of the same request.
    const attempt = Date.now()
    const idempotencyKey = `regen:${projectId}:${clipJob.order_index}:${attempt}`

    const debit = await debitTokens(user.id, TOKENS_PER_CLIP, 'regeneration', {
      idempotencyKey,
      usdEstimate: CLIP_USD_ESTIMATE,
    })

    if (debit.status === 'insufficient') {
      return NextResponse.json(
        { error: 'insufficient_balance', balance: debit.balance, required: TOKENS_PER_CLIP },
        { status: 402 }
      )
    }
    if (debit.status === 'ceiling_exceeded') {
      return NextResponse.json({ error: 'daily_limit_reached' }, { status: 503 })
    }

    // Supersede first: the partial unique index allows only one live clip per
    // slot, so the old row must step aside before the new one is inserted.
    await db
      .from('clip_jobs')
      .update({ is_current: false, superseded_at: new Date().toISOString() })
      .eq('id', clipJob.id)

    const { data: newClip, error: insertErr } = await db
      .from('clip_jobs')
      .insert({
        project_id: projectId,
        order_index: clipJob.order_index,
        dep_start_index: clipJob.dep_start_index,
        dep_end_index: clipJob.dep_end_index,
        status: 'queued',
        cost_tokens: TOKENS_PER_CLIP,
        cost_usd_estimate: CLIP_USD_ESTIMATE,
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single()

    if (insertErr || !newClip) {
      // Put the old clip back so the slot isn't left empty, and release the USD
      // reservation. Tokens stay debited — the ledger has no refund path.
      await db
        .from('clip_jobs')
        .update({ is_current: true, superseded_at: null })
        .eq('id', clipJob.id)
      await releaseDailySpend(CLIP_USD_ESTIMATE)

      console.error('Regen insert failed:', insertErr)
      return NextResponse.json({ error: 'Failed to create clip job' }, { status: 500 })
    }

    await db
      .from('token_transactions')
      .update({ job_id: newClip.id })
      .eq('idempotency_key', idempotencyKey)

    const dispatch = await fetch(`${videoServiceUrl}/regen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GENERATION_WEBHOOK_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        clip_job_id: newClip.id,
        project_id: projectId,
        order_index: clipJob.order_index,
        start_still_s3_key: startKey,
        end_still_s3_key: endKey,
        aspect_ratio: project.aspect_ratio || '16:9',
      }),
    }).catch((err) => {
      console.error('Regen dispatch failed:', err)
      return null
    })

    if (!dispatch || !dispatch.ok) {
      const reason = !dispatch
        ? 'Compute service unreachable'
        : `Compute service returned ${dispatch.status}`

      await db
        .from('clip_jobs')
        .update({ status: 'failed', error_message: reason })
        .eq('id', newClip.id)

      return NextResponse.json({ error: reason }, { status: 502 })
    }

    return NextResponse.json({
      clipJobId: newClip.id,
      orderIndex: clipJob.order_index,
      supersededId: clipJob.id,
      status: 'queued',
    })
  } catch (error: unknown) {
    console.error('Regen error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Map a photo's order_index to its reframed still's S3 key. */
async function stillsByIndex(
  db: ReturnType<typeof serviceClient>,
  projectId: string
): Promise<Map<number, string>> {
  const { data } = await db
    .from('reframes')
    .select('s3_key, photos!inner(order_index)')
    .eq('project_id', projectId)

  const map = new Map<number, string>()
  for (const row of (data ?? []) as unknown as {
    s3_key: string
    photos: { order_index: number } | { order_index: number }[]
  }[]) {
    const photo = Array.isArray(row.photos) ? row.photos[0] : row.photos
    if (photo?.order_index != null) map.set(photo.order_index, row.s3_key)
  }
  return map
}
