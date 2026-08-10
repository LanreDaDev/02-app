import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reconcileDailySpend } from '@/lib/tokens'

/**
 * Callbacks from the worker.
 *
 * A slot's generation is one task, so this is now a record of what happened
 * rather than a dispatcher. Nothing here decides what runs next — that was the
 * dependency graph, and it went with the derived-clip model.
 *
 * Never refunds tokens. Retry is the mitigation for transient failure; a
 * terminal failure is a support conversation, not an automatic give-back.
 */

type ReframeDone = {
  type: 'reframe_done'
  project_id: string
  photo_id: string
  s3_key: string
  outcome: string
}

type ClipDone = {
  type: 'clip_done'
  clip_job_id: string
  slot_id: string
  project_id: string
  mux_asset_id: string | null
  mux_playback_id?: string | null
  /** The clip's actual final frame, so the next slot can start exactly there. */
  last_frame_s3_key?: string | null
  /** Measured, not estimated: generations really made, seconds really produced. */
  cost_usd_actual?: number
  image_generations?: number
}

type ClipFailed = {
  type: 'clip_failed'
  clip_job_id: string
  project_id: string
  error_message?: string
}

type Payload = ReframeDone | ClipDone | ClipFailed

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
      case 'reframe_done':
        return NextResponse.json(await handleReframeDone(body))
      case 'clip_done':
        return NextResponse.json(await handleClipDone(body))
      case 'clip_failed':
        return NextResponse.json(await handleClipFailed(body))
      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }
  } catch (error: unknown) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * A photo has been reframed. Reported as soon as it lands rather than at the end
 * of the slot, because the still is worth keeping even if the video generation
 * after it fails — and because it must never be paid for twice.
 */
async function handleReframeDone(body: ReframeDone) {
  const supabase = db()

  await supabase.from('reframes').upsert(
    {
      project_id: body.project_id,
      photo_id: body.photo_id,
      s3_key: body.s3_key,
      outcome: body.outcome,
    },
    { onConflict: 'project_id,photo_id' }
  )

  return { ok: true }
}

async function handleClipDone(body: ClipDone) {
  const supabase = db()

  const { data: take } = await supabase
    .from('clip_jobs')
    .select('id, project_id, slot_id, cost_usd_estimate')
    .eq('id', body.clip_job_id)
    .single()

  if (!take) return { error: 'Take not found' }

  const update: Record<string, unknown> = {
    status: 'succeeded',
    mux_asset_id: body.mux_asset_id,
    error_message: null,
  }

  // The Mux webhook may have delivered this already — the two callbacks race,
  // and either order has to end with the id present.
  if (body.mux_playback_id) update.mux_playback_id = body.mux_playback_id
  if (body.cost_usd_actual != null) update.cost_usd_actual = body.cost_usd_actual

  await supabase.from('clip_jobs').update(update).eq('id', body.clip_job_id)

  // Swap the reservation for what it really cost, so the daily figure stops
  // being an accumulation of guesses.
  await reconcileDailySpend(
    take.cost_usd_estimate ?? 0,
    body.cost_usd_actual ?? take.cost_usd_estimate ?? 0
  )

  // The extracted final frame becomes an ordinary photo. It is reframed like any
  // other when a slot uses it — the reframe is for quality and sizing, not for
  // correcting something specific to camera output.
  if (body.last_frame_s3_key) {
    await supabase.from('photos').insert({
      project_id: body.project_id,
      s3_key: body.last_frame_s3_key,
      s3_url: '',
      file_name: 'Final frame',
      source: 'extracted_frame',
      derived_from_clip_job_id: body.clip_job_id,
      selected: false,
    })
  }

  return { ok: true }
}

async function handleClipFailed(body: ClipFailed) {
  const supabase = db()

  const { data: take } = await supabase
    .from('clip_jobs')
    .select('id, project_id, slot_id, attempts, cost_usd_estimate, slots(name), projects!inner(user_id)')
    .eq('id', body.clip_job_id)
    .single()

  if (!take) return { error: 'Take not found' }

  await supabase
    .from('clip_jobs')
    .update({
      status: 'failed',
      attempts: (take.attempts ?? 0) + 1,
      error_message: body.error_message ?? 'Generation failed',
    })
    .eq('id', body.clip_job_id)

  // A clip that never ran shouldn't hold USD headroom. Tokens are not refunded —
  // that is deliberate, and why exposure is capped at one clip.
  await reconcileDailySpend(take.cost_usd_estimate ?? 0, 0)

  const userId = (take as unknown as { projects: { user_id: string } }).projects.user_id
  const slot = (take as unknown as { slots: { name: string } | null }).slots
  const name = slot?.name ?? 'A clip'

  // The raw error stays on the row for debugging. What the agent reads is
  // written for them — and names the clip, because "Clip 14 failed" is useless
  // where "Kitchen didn't finish" is actionable.
  await supabase.from('notifications').insert({
    user_id: userId,
    project_id: take.project_id,
    type: 'job_failed',
    title: "Couldn't generate a clip",
    message: `${name} didn't finish. Press Generate to try it again.`,
  })

  return { ok: true }
}
