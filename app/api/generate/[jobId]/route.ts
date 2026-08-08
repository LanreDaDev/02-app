import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { muxMp4Url, muxThumbnailUrl } from '@/lib/mux'
import { TOKENS_PER_CLIP } from '@/lib/tokens'

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

    const [{ data: imageJobs }, { data: clipJobs }, { count: selectedPhotos }] =
      await Promise.all([
        supabase
          .from('image_jobs')
          .select('order_index, status')
          .eq('project_id', projectId)
          .order('order_index', { ascending: true }),
        supabase
          .from('clip_jobs')
          .select('id, order_index, status, mux_playback_id, error_message')
          .eq('project_id', projectId)
          .eq('is_current', true)
          .order('order_index', { ascending: true }),
        supabase
          .from('photos')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('selected', true),
      ])

    const images = imageJobs ?? []
    const clips = clipJobs ?? []
    const totalClips = Math.max((selectedPhotos ?? 0) - 1, 0)

    // A clip is only PLAYABLE once Mux has given us a playback ID — 'succeeded'
    // alone just means the file reached Mux and is still encoding.
    const clipPayload = clips.map((c) => ({
      id: c.id,
      orderIndex: c.order_index,
      status: c.status,
      playable: c.status === 'succeeded' && !!c.mux_playback_id,
      muxPlaybackId: c.mux_playback_id,
      src: c.mux_playback_id ? muxMp4Url(c.mux_playback_id) : null,
      thumbnail: c.mux_playback_id ? muxThumbnailUrl(c.mux_playback_id) : null,
      error: c.error_message,
    }))

    const clipsDone = clips.filter((c) => c.status === 'succeeded').length
    const clipsFailed = clips.filter((c) => c.status === 'failed').length
    const inFlight = clips.some((c) =>
      ['waiting', 'queued', 'running'].includes(c.status)
    )
    const imagesInFlight = images.some((i) =>
      ['queued', 'running'].includes(i.status)
    )

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
      images: {
        total: images.length,
        succeeded: images.filter((i) => i.status === 'succeeded').length,
        failed: images.filter((i) => i.status === 'failed').length,
      },
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
      affordableClips: Math.floor(balance / TOKENS_PER_CLIP),
    })
  } catch (error: unknown) {
    console.error('Graph status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
