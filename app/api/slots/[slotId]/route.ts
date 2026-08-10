import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { CameraMotion, ClipDuration, SlotKind, StillMotion } from '@/lib/types/database'

/**
 * One slot: rename, choose frames, set motion and duration, switch kind, delete.
 *
 * Switching kind is non-destructive in both directions. Going generated → still
 * keeps the start photo and leaves any takes in place; going back finds them
 * again. Nothing an agent has paid for is thrown away by a control that reads
 * like a toggle.
 */

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function authorizeSlot(slotId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const db = serviceClient()
  const { data: slot } = await db
    .from('slots')
    .select('*, projects!inner(user_id)')
    .eq('id', slotId)
    .single()

  if (!slot || (slot as unknown as { projects: { user_id: string } }).projects.user_id !== user.id) {
    return { error: 'Clip not found', status: 404 as const }
  }

  return { slot, db }
}

interface SlotPatch {
  name?: string
  kind?: SlotKind
  startPhotoId?: string | null
  endPhotoId?: string | null
  cameraMotion?: CameraMotion | null
  motionAggression?: number
  durationSeconds?: ClipDuration
  holdDurationSeconds?: number
  stillMotion?: StillMotion
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slotId: string }> }
) {
  try {
    const { slotId } = await params
    const auth = await authorizeSlot(slotId)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { slot, db } = auth
    const body = (await request.json()) as SlotPatch
    const update: Record<string, unknown> = {}

    if (body.name !== undefined) {
      // Empty restores the default rather than leaving a blank label.
      const trimmed = body.name.trim().slice(0, 40)
      update.name = trimmed || 'Clip'
    }

    if (body.kind !== undefined) {
      update.kind = body.kind
      // A still is one photo held. Its second frame can't survive the switch —
      // but the takes do, so switching back finds them again.
      if (body.kind === 'still') update.end_photo_id = null
    }

    if (body.startPhotoId !== undefined) update.start_photo_id = body.startPhotoId
    if (body.endPhotoId !== undefined) update.end_photo_id = body.endPhotoId

    if (body.cameraMotion !== undefined) update.camera_motion = body.cameraMotion

    if (body.motionAggression !== undefined) {
      update.motion_aggression = Math.max(0, Math.min(100, Math.round(body.motionAggression)))
    }

    if (body.durationSeconds !== undefined) {
      if (![4, 6, 8].includes(body.durationSeconds)) {
        return NextResponse.json(
          { error: 'Length must be 4, 6 or 8 seconds' },
          { status: 400 }
        )
      }
      update.duration_seconds = body.durationSeconds
    }

    if (body.holdDurationSeconds !== undefined) {
      // No upper bound: a still has no take to trim against, which is what makes
      // it the one thing that resizes freely.
      update.hold_duration_seconds = Math.max(0.5, body.holdDurationSeconds)
    }

    if (body.stillMotion !== undefined) update.still_motion = body.stillMotion

    // A slot can't travel from a photo to itself. Checked here so the agent gets
    // a sentence rather than a constraint violation.
    const nextStart = 'start_photo_id' in update ? update.start_photo_id : slot.start_photo_id
    const nextEnd = 'end_photo_id' in update ? update.end_photo_id : slot.end_photo_id
    if (nextEnd && nextEnd === nextStart) {
      return NextResponse.json(
        { error: 'A clip needs two different photos to travel between.' },
        { status: 400 }
      )
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ slot })
    }

    const { data: updated, error } = await db
      .from('slots')
      .update(update)
      .eq('id', slotId)
      .select('*')
      .single()

    if (error || !updated) {
      console.error('Update slot failed:', error)
      return NextResponse.json({ error: 'Could not save the change' }, { status: 500 })
    }

    // A take generated with different settings than the slot now carries is
    // stale. The take keeps playing; the panel says what changed.
    const { data: activeTake } = await db
      .from('clip_jobs')
      .select('params')
      .eq('slot_id', slotId)
      .eq('is_current', true)
      .maybeSingle()

    return NextResponse.json({
      slot: updated,
      changedSinceTake: activeTake?.params ? changedParams(activeTake.params, updated) : [],
    })
  } catch (error: unknown) {
    console.error('Update slot error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slotId: string }> }
) {
  try {
    const { slotId } = await params
    const auth = await authorizeSlot(slotId)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    // Takes go with it via cascade. The tokens spent on them do not come back —
    // deleting a clip is a decision, not a refund.
    const { error } = await auth.db.from('slots').delete().eq('id', slotId)

    if (error) {
      console.error('Delete slot failed:', error)
      return NextResponse.json({ error: 'Could not delete the clip' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    console.error('Delete slot error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Which settings differ from what the active take was generated with. */
function changedParams(
  takeParams: Record<string, unknown>,
  slot: Record<string, unknown>
): string[] {
  const watched: [string, string][] = [
    ['start_photo_id', 'start photo'],
    ['end_photo_id', 'end photo'],
    ['camera_motion', 'camera motion'],
    ['motion_aggression', 'motion amount'],
    ['duration_seconds', 'length'],
  ]

  return watched
    .filter(([key]) => key in takeParams && takeParams[key] !== slot[key])
    .map(([, label]) => label)
}
