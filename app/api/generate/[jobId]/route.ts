import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { muxMp4Url, muxThumbnailUrl } from '@/lib/mux'
import { getDownloadPresignedUrl } from '@/lib/aws/s3'
import { TOKENS_PER_SECOND } from '@/lib/tokens'
import type { StillMotion } from '@/lib/types/database'

/**
 * How long a still's photo URL stays good.
 *
 * The editor polls this route every 3s and mints a fresh URL each time, so this
 * only has to outlive a tab left open on a stalled network. An hour matches the
 * photo picker.
 */
const PHOTO_URL_TTL_SECONDS = 3600

/**
 * One thing on the timeline. A generated take or a still, in rail order —
 * the editor treats them the same way, because to a sequence a shot is a shot.
 */
interface TimelineItem {
  id: string
  kind: 'video' | 'still'
  slotId: string
  name: string
  durationSeconds: number
  stillMotion: StillMotion | null
  status: string
  playable: boolean
  muxPlaybackId: string | null
  src: string | null
  thumbnail: string | null
  error: string | null
}

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
          .select('id, name, kind, position, start_photo_id, hold_duration_seconds, still_motion')
          .eq('project_id', projectId)
          .order('position', { ascending: true }),
        supabase
          .from('clip_jobs')
          .select('id, slot_id, status, mux_playback_id, duration_seconds, error_message')
          .eq('project_id', projectId)
          .eq('is_current', true),
        supabase
          .from('photos')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('source', 'upload'),
      ])

    const slotList = slots ?? []
    const clips = clipJobs ?? []
    const takeBySlot = new Map(clips.map((c) => [c.slot_id, c]))
    const totalClips = slotList.filter((s) => s.kind === 'generated').length

    // Stills need a URL for the photo itself — there is no Mux asset behind one.
    const stillPhotoIds = slotList
      .filter((s) => s.kind === 'still' && s.start_photo_id)
      .map((s) => s.start_photo_id as string)

    const photoUrls = new Map<string, string>()
    if (stillPhotoIds.length > 0) {
      const { data: photos } = await supabase
        .from('photos')
        .select('id, s3_key')
        .in('id', stillPhotoIds)

      await Promise.all(
        (photos ?? []).map(async (p) => {
          photoUrls.set(p.id, await getDownloadPresignedUrl(p.s3_key, PHOTO_URL_TTL_SECONDS))
        })
      )
    }

    // Rail order, so the timeline opens in the order the agent built rather than
    // in whatever order generations happened to finish. Stills sit in the same
    // sequence as takes: to the timeline a shot is a shot, however it was made.
    const clipPayload = slotList.flatMap((slot): TimelineItem[] => {
      if (slot.kind === 'still') {
        const src = slot.start_photo_id ? photoUrls.get(slot.start_photo_id) : undefined
        // A still with no photo is still a draft. Nothing to put on screen.
        if (!src) return []
        return [
          {
            // Keyed by slot: a still has no job row, and nothing else identifies
            // it. The prefix keeps it from ever colliding with a take id.
            id: `still:${slot.id}`,
            kind: 'still' as const,
            slotId: slot.id,
            name: slot.name,
            durationSeconds: slot.hold_duration_seconds,
            stillMotion: slot.still_motion,
            status: 'succeeded' as const,
            // A still is ready the moment it has a photo — it never encodes.
            playable: true,
            muxPlaybackId: null,
            src,
            thumbnail: src,
            error: null,
          },
        ]
      }

      const take = takeBySlot.get(slot.id)
      if (!take) return []

      return [
        {
          id: take.id,
          kind: 'video' as const,
          // Regenerating targets the SLOT, not the take — a take is a result.
          slotId: slot.id,
          name: slot.name,
          durationSeconds: take.duration_seconds,
          stillMotion: null,
          status: take.status,
          // A clip is only PLAYABLE once Mux has given us a playback ID —
          // 'succeeded' alone just means the file reached Mux and is encoding.
          playable: take.status === 'succeeded' && !!take.mux_playback_id,
          muxPlaybackId: take.mux_playback_id,
          src: take.mux_playback_id ? muxMp4Url(take.mux_playback_id) : null,
          thumbnail: take.mux_playback_id ? muxThumbnailUrl(take.mux_playback_id) : null,
          error: take.error_message,
        },
      ]
    })
      // Assigned after the walk, so a slot that contributes nothing — a draft,
      // or a take that has not landed — does not leave a hole in the numbering.
      .map((item, i) => ({ ...item, orderIndex: i }))

    // Generation progress counts takes only. A still has nothing to wait for.
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
