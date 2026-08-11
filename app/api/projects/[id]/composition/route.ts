import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { FPS, getResolution } from '@/lib/remotion/constants'

/**
 * Persist the timeline edit.
 *
 * Clip order and in/out points ARE the Remotion composition — finalize renders
 * this object as-is. Saving it here is what lets the edit survive a reload and
 * what gives Lambda something to render; there is no separate edit export.
 */

export interface CompositionClip {
  /**
   * The take being shown. Null for a still — a still is a photograph the agent
   * chose, not a job that produced anything.
   */
  clipJobId: string | null
  /**
   * The slot. Required for stills, since nothing else identifies one. Optional
   * for takes, and absent on compositions saved before stills could render.
   */
  slotId?: string | null
  /** Absent means video, which is all a composition could hold until now. */
  kind?: 'video' | 'still'
  orderIndex: number
  inFrame: number
  outFrame: number
}

export interface StoredComposition {
  fps: number
  width: number
  height: number
  clips: CompositionClip[]
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, aspect_ratio')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = (await request.json()) as { clips?: CompositionClip[] }
    if (!Array.isArray(body.clips)) {
      return NextResponse.json({ error: 'clips array required' }, { status: 400 })
    }

    const db = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Only accept items that actually belong to this project and are live —
    // this object drives a paid render, so it can't be trusted from the client.
    const [{ data: liveClips }, { data: stillSlots }] = await Promise.all([
      db
        .from('clip_jobs')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .eq('status', 'succeeded'),
      // A still is live once it has a photo. There is no job to succeed.
      db
        .from('slots')
        .select('id')
        .eq('project_id', projectId)
        .eq('kind', 'still')
        .not('start_photo_id', 'is', null),
    ])

    const allowedTakes = new Set((liveClips ?? []).map((c) => c.id))
    const allowedStills = new Set((stillSlots ?? []).map((s) => s.id))

    const clips = body.clips
      .filter((c) =>
        c.kind === 'still'
          ? Boolean(c.slotId) && allowedStills.has(c.slotId as string)
          : Boolean(c.clipJobId) && allowedTakes.has(c.clipJobId as string)
      )
      .map((c, i) => ({
        clipJobId: c.kind === 'still' ? null : c.clipJobId,
        slotId: c.slotId ?? null,
        kind: c.kind === 'still' ? ('still' as const) : ('video' as const),
        orderIndex: i,
        inFrame: Math.max(0, Math.floor(c.inFrame)),
        outFrame: Math.max(1, Math.floor(c.outFrame)),
      }))
      .filter((c) => c.outFrame > c.inFrame)

    const resolution = getResolution((project.aspect_ratio as '16:9' | '9:16') || '16:9')

    const composition: StoredComposition = {
      fps: FPS,
      width: resolution.width,
      height: resolution.height,
      clips,
    }

    const { error } = await db
      .from('projects')
      .update({ composition, composition_updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (error) {
      console.error('Failed to save composition:', error)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    return NextResponse.json({ saved: clips.length, rejected: body.clips.length - clips.length })
  } catch (error: unknown) {
    console.error('Composition save error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
