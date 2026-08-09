import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookSignature } from '@remotion/lambda/client'

/**
 * Remotion Lambda render callback.
 *
 * On success the MP4 already lives in S3 — that is the download artifact. This
 * route additionally hands the same file to Mux so the finished video can be
 * streamed in-app. One render, two destinations; nothing is rendered twice.
 *
 * The Mux playback ID arrives later via /api/mux/webhook, routed by passthrough.
 */

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Hand the rendered MP4 to Mux by URL. Returns the new asset id. */
async function ingestToMux(
  url: string,
  projectId: string,
  videoId: string
): Promise<string | null> {
  const tokenId = process.env.MUX_TOKEN_ID
  const tokenSecret = process.env.MUX_TOKEN_SECRET
  if (!tokenId || !tokenSecret) {
    console.error('Mux credentials missing; final render will not be streamable')
    return null
  }

  try {
    const res = await fetch('https://api.mux.com/video/v1/assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        input: [{ url }],
        playback_policy: ['public'],
        // Same rendition the clips use, so muxMp4Url() resolves for the final
        // video too. `mp4_support: "standard"` is rejected on current accounts.
        static_renditions: [{ resolution: process.env.MUX_STATIC_RENDITION || 'highest' }],
        // Routes the asset-ready webhook back to this row.
        passthrough: JSON.stringify({ kind: 'video', project_id: projectId, video_id: videoId }),
      }),
    })

    if (!res.ok) {
      console.error('Mux ingest failed:', res.status, await res.text())
      return null
    }

    const json = (await res.json()) as { data?: { id?: string } }
    return json.data?.id ?? null
  } catch (err) {
    console.error('Mux ingest threw:', err)
    return null
  }
}

export async function POST(request: Request) {
  try {
    // Raw body: the signature is computed over these exact bytes.
    const rawBody = await request.text()
    const secret = process.env.REMOTION_WEBHOOK_SECRET ?? null

    if (secret) {
      const signatureHeader = request.headers.get('X-Remotion-Signature')
      if (!signatureHeader) {
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
      }

      try {
        validateWebhookSignature({
          secret,
          body: JSON.parse(rawBody),
          signatureHeader,
        })
      } catch {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload = JSON.parse(rawBody) as {
      type: 'success' | 'error' | 'timeout'
      renderId: string
      bucketName?: string
      outputUrl?: string
      outputFile?: string
      lambdaErrors?: { message: string }[]
      errors?: { message: string }[]
    }

    const supabase = db()

    const { data: video } = await supabase
      .from('videos')
      .select('id, project_id, status')
      .eq('render_id', payload.renderId)
      .maybeSingle()

    if (!video) {
      // Acknowledge so Remotion stops retrying something we can't place.
      console.error('No video row for renderId', payload.renderId)
      return NextResponse.json({ received: true })
    }

    if (payload.type !== 'success') {
      const message =
        payload.lambdaErrors?.[0]?.message ??
        payload.errors?.[0]?.message ??
        (payload.type === 'timeout' ? 'Render timed out' : 'Render failed')

      await supabase
        .from('videos')
        .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', video.id)

      await supabase.from('notifications').insert({
        user_id: await ownerOf(supabase, video.project_id),
        project_id: video.project_id,
        type: 'job_failed',
        title: 'Render Failed',
        message,
      })

      return NextResponse.json({ received: true })
    }

    const outputUrl = payload.outputUrl
    // Remotion writes to its own S3 bucket — that IS the durable download file.
    const s3Key = payload.outputFile ?? (outputUrl ? new URL(outputUrl).pathname.slice(1) : null)

    const muxAssetId = outputUrl
      ? await ingestToMux(outputUrl, video.project_id, video.id)
      : null

    await supabase
      .from('videos')
      .update({
        status: 'ready',
        s3_key: s3Key,
        mux_asset_id: muxAssetId,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', video.id)

    await supabase.from('notifications').insert({
      user_id: await ownerOf(supabase, video.project_id),
      project_id: video.project_id,
      type: 'job_succeeded',
      title: 'Video Ready',
      message: 'Your finished video is ready to watch and download.',
    })

    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    console.error('Finalize webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function ownerOf(supabase: ReturnType<typeof db>, projectId: string): Promise<string> {
  const { data } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single()
  return data?.user_id as string
}
