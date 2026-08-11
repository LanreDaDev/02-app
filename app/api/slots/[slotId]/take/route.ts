import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Switch which take is active for a slot.
 *
 * Instant and free. A take is a result the agent already paid for, so going
 * back to an earlier one is a selection, not a generation — nothing queues and
 * nothing is charged. This is what makes regenerating safe to try: the previous
 * result is still there.
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
    .select('id, projects!inner(user_id)')
    .eq('id', slotId)
    .single()

  if (
    !slot ||
    (slot as unknown as { projects: { user_id: string } }).projects.user_id !== user.id
  ) {
    return { error: 'Clip not found', status: 404 as const }
  }

  return { slot, db }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slotId: string }> }
) {
  try {
    const { slotId } = await params
    const auth = await authorizeSlot(slotId)
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { db } = auth
    const { takeId } = (await request.json().catch(() => ({}))) as { takeId?: string }

    if (!takeId) {
      return NextResponse.json({ error: 'takeId is required' }, { status: 400 })
    }

    // The take must belong to this slot — otherwise a slot id the agent owns
    // could be used to activate a take from a project they do not.
    const { data: take } = await db
      .from('clip_jobs')
      .select('id, slot_id, status')
      .eq('id', takeId)
      .eq('slot_id', slotId)
      .maybeSingle()

    if (!take) {
      return NextResponse.json({ error: 'Take not found' }, { status: 404 })
    }

    // Only a finished take can play. Activating a queued one would put a slot
    // into a state where it reads ready and has nothing to show.
    if (take.status !== 'succeeded') {
      return NextResponse.json(
        { error: 'That take has not finished generating.' },
        { status: 409 }
      )
    }

    // Clear first, then set. idx_clip_jobs_active_take is unique per slot where
    // is_current, so setting the new one first would collide with the old.
    await db
      .from('clip_jobs')
      .update({ is_current: false, superseded_at: new Date().toISOString() })
      .eq('slot_id', slotId)
      .eq('is_current', true)

    const { error } = await db
      .from('clip_jobs')
      .update({ is_current: true, superseded_at: null })
      .eq('id', takeId)

    if (error) {
      console.error('Switch take failed:', error)
      return NextResponse.json({ error: 'Could not switch take' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, takeId })
  } catch (error: unknown) {
    console.error('Switch take error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
