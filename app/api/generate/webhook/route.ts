import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reconcileDailySpend, CLIP_USD_ESTIMATE } from '@/lib/tokens'

/**
 * Callbacks from the Celery workers.
 *
 * The important one is `image_done`: this route marks the image job succeeded,
 * records the reframe, then asks the database which clips that unblocked and
 * returns them in the RESPONSE. The worker dispatches whatever comes back.
 *
 * That keeps Postgres the single source of truth for dependency state — the
 * worker holds no dependency map of its own — while dispatch stays immediate.
 *
 * Never refunds tokens. Retry is the mitigation for transient failure; a
 * terminal failure is a support conversation, not an automatic give-back.
 */

type ImageDone = {
  type: 'image_done'
  image_job_id: string
  project_id: string
  order_index: number
  s3_key: string
  outcome: string
}

type ClipDone = {
  type: 'clip_done'
  clip_job_id: string
  project_id: string
  order_index: number
  mux_asset_id: string | null
  /** Present when Mux finished encoding before the worker stopped waiting. */
  mux_playback_id?: string | null
  cost_usd_actual?: number
}

type JobFailed = {
  type: 'image_failed' | 'clip_failed'
  image_job_id?: string
  clip_job_id?: string
  project_id: string
  order_index: number
  error_message?: string
}

type Payload = ImageDone | ClipDone | JobFailed

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  try {
    const expected = process.env.GENERATION_WEBHOOK_SECRET
    if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as Payload
    if (!body?.type) {
      return NextResponse.json({ error: 'type required' }, { status: 400 })
    }

    switch (body.type) {
      case 'image_done':
        return NextResponse.json(await handleImageDone(body))
      case 'clip_done':
        return NextResponse.json(await handleClipDone(body))
      case 'image_failed':
      case 'clip_failed':
        return NextResponse.json(await handleFailure(body))
      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }
  } catch (error: unknown) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * An image finished reframing. Record it, then release any clip whose BOTH
 * stills are now ready. A shared boundary still can release two clips at once —
 * the one that ends on it and the one that starts on it.
 */
async function handleImageDone(body: ImageDone) {
  const supabase = db()

  const { data: imageJob } = await supabase
    .from('image_jobs')
    .select('id, project_id, photo_id, order_index')
    .eq('id', body.image_job_id)
    .single()

  if (!imageJob) return { error: 'Image job not found' }

  // The single final still for this photo. One row per photo, so a re-delivered
  // webhook overwrites rather than accumulating attempt history.
  await supabase.from('reframes').upsert(
    {
      project_id: imageJob.project_id,
      photo_id: imageJob.photo_id,
      s3_key: body.s3_key,
      outcome: body.outcome,
    },
    { onConflict: 'project_id,photo_id' }
  )

  await supabase
    .from('image_jobs')
    .update({ status: 'succeeded', error_message: null })
    .eq('id', body.image_job_id)

  const { data: released, error: rpcError } = await supabase.rpc('satisfy_clip_dependencies', {
    p_project_id: imageJob.project_id,
    p_order_index: imageJob.order_index,
  })

  if (rpcError) {
    console.error('satisfy_clip_dependencies failed:', rpcError)
    return { dispatch: [] }
  }

  const rows = (released ?? []) as {
    clip_job_id: string
    order_index: number
    dep_start_index: number
    dep_end_index: number
  }[]

  if (rows.length === 0) return { dispatch: [] }

  // Resolve each released clip's two stills. reframes is keyed by photo, so go
  // through photos to get from a dependency index to an S3 key.
  const stills = await stillsByIndex(supabase, imageJob.project_id)

  const dispatch = rows
    .map((r) => ({
      clip_job_id: r.clip_job_id,
      order_index: r.order_index,
      start_still_s3_key: stills.get(r.dep_start_index) ?? '',
      end_still_s3_key: stills.get(r.dep_end_index) ?? '',
    }))
    .filter((d) => d.start_still_s3_key && d.end_still_s3_key)

  // Anything we can't resolve stills for must not sit silently in 'queued'.
  const unresolved = rows.length - dispatch.length
  if (unresolved > 0) {
    console.error(
      `${unresolved} clip(s) released but missing stills; returning them to waiting`
    )
    const dispatched = new Set(dispatch.map((d) => d.clip_job_id))
    await supabase
      .from('clip_jobs')
      .update({ status: 'waiting' })
      .in(
        'id',
        rows.map((r) => r.clip_job_id).filter((id) => !dispatched.has(id))
      )
  }

  return { dispatch }
}

/** Map a photo's order_index to its reframed still's S3 key. */
async function stillsByIndex(
  supabase: ReturnType<typeof db>,
  projectId: string
): Promise<Map<number, string>> {
  const { data } = await supabase
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

/**
 * A clip finished generating and is uploading to Mux. The playback ID arrives
 * separately once Mux finishes encoding (see /api/mux/webhook).
 */
async function handleClipDone(body: ClipDone) {
  const supabase = db()

  const { data: clipJob } = await supabase
    .from('clip_jobs')
    .select('id, project_id, cost_usd_estimate, projects!inner(user_id)')
    .eq('id', body.clip_job_id)
    .single()

  if (!clipJob) return { error: 'Clip job not found' }

  // Don't null out a playback ID the Mux webhook may have already delivered —
  // the two callbacks race, and either order must end with the ID present.
  const update: Record<string, unknown> = {
    status: 'succeeded',
    mux_asset_id: body.mux_asset_id,
    cost_usd_actual: body.cost_usd_actual ?? clipJob.cost_usd_estimate,
    error_message: null,
  }
  if (body.mux_playback_id) update.mux_playback_id = body.mux_playback_id

  await supabase.from('clip_jobs').update(update).eq('id', body.clip_job_id)

  // Swap the reservation for the real cost so the daily ceiling tracks actuals.
  await reconcileDailySpend(
    clipJob.cost_usd_estimate ?? CLIP_USD_ESTIMATE,
    body.cost_usd_actual ?? clipJob.cost_usd_estimate ?? CLIP_USD_ESTIMATE
  )

  return { ok: true }
}

async function handleFailure(body: JobFailed) {
  const supabase = db()
  const table = body.type === 'image_failed' ? 'image_jobs' : 'clip_jobs'
  const jobId = body.type === 'image_failed' ? body.image_job_id : body.clip_job_id

  if (!jobId) return { error: 'job id required' }

  const { data: job } = await supabase
    .from(table)
    .select('id, project_id, attempts, projects!inner(user_id)')
    .eq('id', jobId)
    .single()

  if (!job) return { error: 'Job not found' }

  await supabase
    .from(table)
    .update({
      status: 'failed',
      attempts: (job.attempts ?? 0) + 1,
      error_message: body.error_message ?? 'Generation failed',
    })
    .eq('id', jobId)

  // A failed clip never runs, so hand its reserved USD back. Tokens are not
  // refunded — that is deliberate, and why exposure is capped at one clip.
  if (body.type === 'clip_failed') {
    const { data: clipJob } = await supabase
      .from('clip_jobs')
      .select('cost_usd_estimate')
      .eq('id', jobId)
      .single()

    await reconcileDailySpend(clipJob?.cost_usd_estimate ?? CLIP_USD_ESTIMATE, 0)
  }

  const userId = (job as unknown as { projects: { user_id: string } }).projects.user_id

  // The raw error stays on the job row for debugging. What the user sees is
  // written for them — an agent has no use for an HTTP status and response
  // headers, and pasting a provider's stack trace into a notification bell
  // reads as broken software rather than a retryable hiccup.
  await supabase.from('notifications').insert({
    user_id: userId,
    project_id: job.project_id,
    type: 'job_failed',
    title: body.type === 'image_failed' ? "Couldn't prepare a photo" : "Couldn't generate a clip",
    message: userFacingFailure(body),
  })

  return { ok: true }
}

/**
 * A message for the person who uploaded the photos, not for whoever reads logs.
 *
 * Retrying a failed clip reuses its original debit — /api/generate resets a
 * failed clip to 'waiting' rather than creating a new one — so it genuinely
 * costs nothing, and saying so is the difference between a user retrying and a
 * user emailing support.
 */
function userFacingFailure(body: JobFailed): string {
  const position = body.order_index + 1

  if (body.type === 'image_failed') {
    return `Photo ${position} couldn't be prepared for video. Press Generate to try it again — this won't use additional tokens.`
  }

  return `Clip ${position} didn't finish. Press Generate to retry it — retrying a failed clip doesn't cost additional tokens.`
}
