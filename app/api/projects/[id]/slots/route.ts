import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { SlotKind } from '@/lib/types/database'

/**
 * Slots for a project.
 *
 * A slot is the authoring unit: one or two photos plus how the camera moves.
 * Nothing derives slots from an upload — the agent adds each one deliberately,
 * which is the whole point of the model.
 */

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function authorize(projectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (!project || project.user_id !== user.id) {
    return { error: 'Project not found', status: 404 as const }
  }

  return { userId: user.id }
}

/** Slots with their active take, in rail order. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const auth = await authorize(projectId)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const db = serviceClient()

    const [{ data: slots }, { data: takes }] = await Promise.all([
      db
        .from('slots')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true }),
      db
        .from('clip_jobs')
        .select('id, slot_id, status, mux_playback_id, is_current, params, created_at, error_message')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ])

    const bySlot = new Map<string, typeof takes>()
    for (const take of takes ?? []) {
      const list = bySlot.get(take.slot_id) ?? []
      list.push(take)
      bySlot.set(take.slot_id, list)
    }

    return NextResponse.json({
      slots: (slots ?? []).map((slot) => {
        const slotTakes = bySlot.get(slot.id) ?? []
        const active = slotTakes.find((t) => t.is_current) ?? null

        return {
          ...slot,
          takes: slotTakes,
          activeTake: active,
          // A still is ready the moment it has a photo — it never generates.
          state: slotState(slot, active),
        }
      }),
    })
  } catch (error: unknown) {
    console.error('List slots error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Append a slot. New slots default to generated — the product's reason to exist. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const auth = await authorize(projectId)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as {
      kind?: SlotKind
      startPhotoId?: string
      name?: string
    }

    const db = serviceClient()

    // Append. Defaults don't renumber on reorder — silently renaming something
    // the agent didn't touch is worse than a number being out of sequence.
    const { data: last } = await db
      .from('slots')
      .select('position')
      .eq('project_id', projectId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const position = last ? last.position + 1 : 0

    const { count } = await db
      .from('slots')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    const { data: slot, error } = await db
      .from('slots')
      .insert({
        project_id: projectId,
        name: body.name?.slice(0, 40) || `Clip ${(count ?? 0) + 1}`,
        kind: body.kind ?? 'generated',
        position,
        start_photo_id: body.startPhotoId ?? null,
      })
      .select('*')
      .single()

    if (error || !slot) {
      console.error('Create slot failed:', error)
      return NextResponse.json({ error: 'Could not add clip' }, { status: 500 })
    }

    return NextResponse.json({ slot: { ...slot, takes: [], activeTake: null, state: slotState(slot, null) } })
  } catch (error: unknown) {
    console.error('Create slot error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Rail order. Sent as the full ordered list rather than a move, so the result
 * can't drift from what the agent sees after a dropped request.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const auth = await authorize(projectId)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { slotIds } = (await request.json()) as { slotIds?: string[] }
    if (!Array.isArray(slotIds)) {
      return NextResponse.json({ error: 'slotIds array required' }, { status: 400 })
    }

    const db = serviceClient()

    const { data: owned } = await db
      .from('slots')
      .select('id')
      .eq('project_id', projectId)

    const allowed = new Set((owned ?? []).map((s) => s.id))

    await Promise.all(
      slotIds
        .filter((id) => allowed.has(id))
        .map((id, position) =>
          db.from('slots').update({ position }).eq('id', id).eq('project_id', projectId)
        )
    )

    return NextResponse.json({ ok: true, ordered: slotIds.filter((id) => allowed.has(id)).length })
  } catch (error: unknown) {
    console.error('Reorder slots error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Rail state. Stills have two states and never queue, generate, fail or go
 * stale; conflating the two kinds here is how the panel ends up showing a
 * progress ring on a photo.
 */
function slotState(
  slot: { kind: SlotKind; start_photo_id: string | null },
  activeTake: { status: string } | null
): 'draft' | 'queued' | 'running' | 'ready' | 'failed' {
  if (!slot.start_photo_id) return 'draft'
  if (slot.kind === 'still') return 'ready'
  if (!activeTake) return 'draft'

  switch (activeTake.status) {
    case 'succeeded':
      return 'ready'
    case 'failed':
      return 'failed'
    case 'running':
      return 'running'
    default:
      return 'queued'
  }
}
