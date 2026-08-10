import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { muxMp4Url, muxThumbnailUrl } from '@/lib/mux'
import { TOKENS_PER_SECOND } from '@/lib/tokens'

/**
 * Generation graph status. Polled every 3s by the editor.
 *
 * `jobId` is the PROJECT id — a generation is the whole graph for a project, not
 * a single job row.
 *
 * This is the "streaming": as each clip's Mux playback ID lands, it appears here
 * and the client drops it into the timeline. Progressive per-clip delivery over
 * plain polling, no WebSocket or SSE anywhere.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId: projectId } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, aspect_ratio, composition')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [{ data: slots }, { data: clipJobs }, { count: photoCount }] =
      await Promise.all([
        supabase
          .from('slots')
          .select('id, name, kind, position')
          .eq('project_id', projectId)
          .order('position', { ascending: true }),
        supabase
          .from('clip_jobs')
          .select('id, slot_id, status, mux_playback_id, duration_seconds, error_message, slots!inner(position, name)')
          .eq('project_id', projectId)
          .eq('is_current', true),
        supabase
          .from('photos')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('source', 'upload'),
      ])

    const slotList = slots ?? []
    // Rail order, so the timeline opens in the order the agent built rather than
    // in whatever order generations happened to finish.
    const clips = [...(clipJobs ?? [])].sort(
      (a, b) =>
        ((a as unknown as { slots: { position: number } }).slots.position ?? 0) -
        ((b as unknown as { slots: { position: number } }).slots.position ?? 0)
    )
    const totalClips = slotList.filter((s) => s.kind === 'generated').length

    // A clip is only PLAYABLE once Mux has given us a playback ID — 'succeeded'
    // alone just means the file reached Mux and is still encoding.
    const clipPayload = clips.map((c, i) => ({
      id: c.id,
      // Regenerating targets the SLOT, not the take — a take is a result.
      slotId: c.slot_id,
      name: (c as unknown as { slots: { name: string } }).slots?.name,
      orderIndex: i,
      durationSeconds: c.duration_seconds,
      status: c.status,
      playable: c.status === 'succeeded' && !!c.mux_playback_id,
      muxPlaybackId: c.mux_playback_id,
      src: c.mux_playback_id ? muxMp4Url(c.mux_playback_id) : null,
      thumbnail: c.mux_playback_id ? muxThumbnailUrl(c.mux_playback_id) : null,
      error: c.error_message,
    }))

    const clipsDone = clips.filter((c) => c.status === 'succeeded').length
    const clipsFailed = clips.filter((c) => c.status === 'failed').length
    const inFlight = clips.some((c) => ['queued', 'running'].includes(c.status))
    const imagesInFlight = false

    let status: 'idle' | 'running' | 'complete' | 'partial' | 'failed'
    if (clips.length === 0) status = 'idle'
    else if (inFlight || imagesInFlight) status = 'running'
    else if (clipsFailed === clips.length) status = 'failed'
    else if (clipsDone < totalClips) status = 'partial'
    else status = 'complete'

    const { data: account } = await supabase
      .from('token_accounts')
      .select('balance_tokens')
      .eq('user_id', user.id)
      .single()

    const balance = account?.balance_tokens ?? 0

    return NextResponse.json({
      projectId,
      status,
      aspectRatio: project.aspect_ratio || '16:9',
      slots: {
        total: slotList.length,
        generated: slotList.filter((s) => s.kind === 'generated').length,
        stills: slotList.filter((s) => s.kind === 'still').length,
      },
      photoCount: photoCount ?? 0,
      clips: clipPayload,
      // The saved edit — order and in/out points. Lets a reload restore the
      // user's trims instead of resetting every clip to full length.
      composition: project.composition ?? null,
      totalClips,
      generated: clipsDone,
      failed: clipsFailed,
      // The paywall lands only after clips have started appearing — never before.
      needsTopUp: clipsDone < totalClips && !inFlight && !imagesInFlight,
      balance,
      // How many seconds of video the balance buys — the price is per second,
      // so "clips" was never the right unit.
      affordableSeconds: Math.floor(balance / TOKENS_PER_SECOND),
    })
  } catch (error: unknown) {
    console.error('Graph status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
