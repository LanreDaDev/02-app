import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { renderMediaOnLambda, type AwsRegion } from '@remotion/lambda/client'
import { muxMp4Url } from '@/lib/mux'
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
 * Raise this once the account's Lambda concurrency quota is raised.
 */
const MAX_LAMBDAS = parseInt(process.env.REMOTION_MAX_LAMBDAS || '6', 10)

/** Remotion requires at least 4 frames per invocation. */
const MIN_FRAMES_PER_LAMBDA = 4

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

    // Build the render input from live clips joined to the saved edit. The DB is
    // the authority on which clips exist and their playback URLs; the saved
    // composition is the authority on order and trim.
    const { data: clipJobs } = await db
      .from('clip_jobs')
      .select('id, order_index, mux_playback_id')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .eq('status', 'succeeded')
      .order('order_index', { ascending: true })

    const playable = (clipJobs ?? []).filter((c) => c.mux_playback_id)

    if (playable.length === 0) {
      return NextResponse.json(
        { error: 'No finished clips to render yet.' },
        { status: 409 }
      )
    }

    const saved = project.composition as StoredComposition | null
    const resolution = getResolution((project.aspect_ratio as '16:9' | '9:16') || '16:9')

    const byId = new Map(playable.map((c) => [c.id, c]))
    const ordered =
      saved?.clips?.length
        ? saved.clips.filter((c) => byId.has(c.clipJobId))
        : // Never edited — render every clip whole, in generation order.
          playable.map((c) => ({
            clipJobId: c.id,
            orderIndex: c.order_index,
            inFrame: 0,
            outFrame: Math.round(4 * FPS),
          }))

    if (ordered.length === 0) {
      return NextResponse.json(
        { error: 'Saved edit references no available clips.' },
        { status: 409 }
      )
    }

    const clips = ordered.map((c) => {
      const job = byId.get(c.clipJobId)!
      const frames = c.outFrame - c.inFrame
      return {
        id: c.clipJobId,
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
