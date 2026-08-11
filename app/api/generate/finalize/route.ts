import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { renderMediaOnLambda, type AwsRegion } from '@remotion/lambda/client'
import { muxMp4Url } from '@/lib/mux'
import { getDownloadPresignedUrl } from '@/lib/aws/s3'
import { FPS, getResolution } from '@/lib/remotion/constants'
import type { StoredComposition } from '@/app/api/projects/[id]/composition/route'

/**
 * Finalize: render the composition the user edited.
 *
 * There is no concat or stitch step. The timeline the user built and the final
 * MP4 are the same Remotion composition — finalize is renderMedia() on it, so
 * the output cannot drift from the editor.
 *
 * Output lands in S3 (the durable download) and is then ingested into Mux (the
 * in-app stream) by /api/generate/finalize/complete. One render, two homes.
 *
 * No token cost.
 */

const REGION = (process.env.REMOTION_AWS_REGION || 'us-east-1') as AwsRegion

/**
 * How many Lambdas a single render may fan out across.
 *
 * Remotion splits a render into concurrent invocations and, left to itself,
 * picks a number tuned for speed — which trips "AWS Concurrency limit reached"
 * on accounts with the default low concurrent-execution quota. Bounding the fan
 * out makes a render slower but reliable, and it stops one render from starving
 * every other Lambda in the account.
 *
 * Default is deliberately tiny because a NEW AWS account is capped at 10
 * concurrent executions (the standard limit is 1000). Remotion's main function
 * plus its renderers, with the overlap during handoff, does not fit in 10 at
 * any useful fan-out — hence 3, leaving the main function and headroom.
 *
 * This is a stopgap, not a setting to keep. Request a Lambda concurrency
 * increase (Service Quotas → Lambda → Concurrent executions, quota L-B99A9384)
 * and then raise this to 20+; renders get several times faster and nothing else
 * needs to change.
 */
const MAX_LAMBDAS = parseInt(process.env.REMOTION_MAX_LAMBDAS || '3', 10)

/** Remotion requires at least 4 frames per invocation. */
const MIN_FRAMES_PER_LAMBDA = 4

/**
 * How long a still's photo URL has to stay good.
 *
 * Lambda fetches it during the render, which is minutes away at worst and can
 * sit in a queue first. Six hours costs nothing and removes the failure mode
 * where a slow render finishes against an expired signature.
 */
const PHOTO_URL_TTL_SECONDS = 6 * 60 * 60

/** One item of the render, resolved from either the saved edit or rail order. */
interface OrderedItem {
  clipJobId: string | null
  slotId: string | null
  kind: 'video' | 'still'
  orderIndex: number
  inFrame: number
  outFrame: number
}

function framesPerLambdaFor(durationInFrames: number): number {
  return Math.max(MIN_FRAMES_PER_LAMBDA, Math.ceil(durationInFrames / MAX_LAMBDAS))
}

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

    const { projectId } = await request.json()
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME
    const serveUrl = process.env.REMOTION_SERVE_URL
    if (!functionName || !serveUrl) {
      return NextResponse.json(
        { error: 'Remotion Lambda not configured' },
        { status: 503 }
      )
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id, aspect_ratio, composition')
      .eq('id', projectId)
      .single()

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const db = serviceClient()

    // Idempotency: one finalize per project. A render already in flight or done
    // is returned rather than started again — renders cost real Lambda time.
    const { data: existing } = await db
      .from('videos')
      .select('id, status, render_id, s3_key, mux_playback_id')
      .eq('project_id', projectId)
      .maybeSingle()

    if (existing && existing.status !== 'failed') {
      return NextResponse.json({
        videoId: existing.id,
        status: existing.status,
        renderId: existing.render_id,
        alreadyStarted: true,
      })
    }

    // Build the render input from live slots joined to the saved edit. The DB is
    // the authority on what exists and where its media lives; the saved
    // composition is the authority on order and trim.
    const [{ data: slots }, { data: clipJobs }] = await Promise.all([
      db
        .from('slots')
        .select('id, kind, position, start_photo_id, hold_duration_seconds, still_motion')
        .eq('project_id', projectId)
        .order('position', { ascending: true }),
      db
        .from('clip_jobs')
        // Not order_index: it is vestigial from the derived model (see
        // migration 021) and this route orders by slots.position or the saved
        // composition. Selecting it kept a dead column looking load-bearing.
        .select('id, slot_id, duration_seconds, mux_playback_id')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .eq('status', 'succeeded'),
    ])

    const playable = (clipJobs ?? []).filter((c) => c.mux_playback_id)
    const takeById = new Map(playable.map((c) => [c.id, c]))
    const takeBySlot = new Map(playable.map((c) => [c.slot_id, c]))

    // Stills render from the photograph itself. Lambda fetches this URL, so it
    // has to outlive the render — hence a much longer life than the editor's.
    const stillSlots = (slots ?? []).filter((s) => s.kind === 'still' && s.start_photo_id)
    const stillSrc = new Map<string, string>()

    if (stillSlots.length > 0) {
      const { data: photos } = await db
        .from('photos')
        .select('id, s3_key')
        .in('id', stillSlots.map((s) => s.start_photo_id as string))

      const keyByPhoto = new Map((photos ?? []).map((p) => [p.id, p.s3_key]))

      await Promise.all(
        stillSlots.map(async (s) => {
          const key = keyByPhoto.get(s.start_photo_id as string)
          if (!key) return
          stillSrc.set(s.id, await getDownloadPresignedUrl(key, PHOTO_URL_TTL_SECONDS))
        })
      )
    }

    if (playable.length === 0 && stillSrc.size === 0) {
      return NextResponse.json(
        { error: 'Nothing to render yet — no finished clips and no stills.' },
        { status: 409 }
      )
    }

    const saved = project.composition as StoredComposition | null
    const resolution = getResolution((project.aspect_ratio as '16:9' | '9:16') || '16:9')

    const slotById = new Map((slots ?? []).map((s) => [s.id, s]))

    const ordered: OrderedItem[] = saved?.clips?.length
      ? saved.clips
          .filter((c) =>
            c.kind === 'still'
              ? Boolean(c.slotId) && stillSrc.has(c.slotId as string)
              : Boolean(c.clipJobId) && takeById.has(c.clipJobId as string)
          )
          .map((c) => ({
            clipJobId: c.clipJobId ?? null,
            slotId: c.slotId ?? null,
            // Compositions saved before stills existed carry no kind at all,
            // and everything in them is a take.
            kind: c.kind === 'still' ? ('still' as const) : ('video' as const),
            orderIndex: c.orderIndex,
            inFrame: c.inFrame,
            outFrame: c.outFrame,
          }))
      : // Never edited — render everything whole, in rail order.
        (slots ?? []).flatMap((slot): OrderedItem[] => {
          if (slot.kind === 'still') {
            if (!stillSrc.has(slot.id)) return []
            return [
              {
                clipJobId: null,
                slotId: slot.id,
                kind: 'still' as const,
                orderIndex: slot.position,
                inFrame: 0,
                outFrame: Math.round(slot.hold_duration_seconds * FPS),
              },
            ]
          }

          const take = takeBySlot.get(slot.id)
          if (!take) return []
          return [
            {
              clipJobId: take.id,
              slotId: slot.id,
              kind: 'video' as const,
              orderIndex: slot.position,
              inFrame: 0,
              // The take's own length. Assuming 4s here truncated every 6- and
              // 8-second clip in a project that was never manually trimmed.
              outFrame: Math.round((take.duration_seconds ?? 4) * FPS),
            },
          ]
        })

    if (ordered.length === 0) {
      return NextResponse.json(
        { error: 'Saved edit references no available clips.' },
        { status: 409 }
      )
    }

    const clips = ordered.map((c) => {
      const frames = c.outFrame - c.inFrame

      if (c.kind === 'still') {
        const slot = slotById.get(c.slotId as string)
        return {
          id: `still:${c.slotId}`,
          kind: 'still' as const,
          src: stillSrc.get(c.slotId as string) as string,
          stillMotion: slot?.still_motion ?? 'none',
          orderIndex: c.orderIndex,
          inFrame: c.inFrame,
          outFrame: c.outFrame,
          durationInFrames: frames,
        }
      }

      const job = takeById.get(c.clipJobId as string)!
      return {
        id: c.clipJobId as string,
        kind: 'video' as const,
        src: muxMp4Url(job.mux_playback_id as string),
        orderIndex: c.orderIndex,
        inFrame: c.inFrame,
        outFrame: c.outFrame,
        durationInFrames: frames,
      }
    })

    const durationInFrames = clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0)

    // Reserve the row before dispatching, so a second request can't slip past
    // the idempotency check while Lambda is starting.
    const { data: video, error: videoErr } = await db
      .from('videos')
      .upsert(
        {
          project_id: projectId,
          status: 'rendering',
          aspect_ratio: project.aspect_ratio || '16:9',
          duration_sec: +(durationInFrames / FPS).toFixed(2),
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      )
      .select('id')
      .single()

    if (videoErr || !video) {
      console.error('Failed to create video row:', videoErr)
      return NextResponse.json({ error: 'Failed to start render' }, { status: 500 })
    }

    try {
      const { renderId, bucketName } = await renderMediaOnLambda({
        region: REGION,
        functionName,
        serveUrl,
        composition: 'Timeline',
        inputProps: {
          clips,
          fps: FPS,
          width: resolution.width,
          height: resolution.height,
        },
        codec: 'h264',
        imageFormat: 'jpeg',
        // Bounded fan-out — see MAX_LAMBDAS. Without this Remotion picks a split
        // tuned for speed and exceeds the account's concurrency quota.
        framesPerLambda: framesPerLambdaFor(durationInFrames),
        // 1080p only — no 4K, no upscale.
        privacy: 'public',
        downloadBehavior: {
          type: 'download',
          fileName: `olade-${projectId}.mp4`,
        },
        webhook: process.env.NEXT_PUBLIC_APP_URL
          ? {
              url: `${process.env.NEXT_PUBLIC_APP_URL}/api/generate/finalize/complete`,
              secret: process.env.REMOTION_WEBHOOK_SECRET ?? null,
            }
          : undefined,
      })

      await db
        .from('videos')
        .update({ render_id: renderId, updated_at: new Date().toISOString() })
        .eq('id', video.id)

      return NextResponse.json({
        videoId: video.id,
        renderId,
        bucketName,
        status: 'rendering',
        clips: clips.length,
        durationSec: +(durationInFrames / FPS).toFixed(2),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Render dispatch failed'
      await db
        .from('videos')
        .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', video.id)

      console.error('renderMediaOnLambda failed:', err)
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } catch (error: unknown) {
    console.error('Finalize error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
