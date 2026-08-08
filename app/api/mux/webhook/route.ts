import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMuxSignature, parsePassthrough } from '@/lib/mux'

/**
 * Mux asset callbacks.
 *
 * The clip task uploads to Mux and gets an asset ID back immediately, but the
 * playback ID only exists once Mux finishes encoding. This route is how it
 * arrives — until it does, a clip is generated but has nothing to play.
 *
 * Handles clips (working assets in the editor) and the final render, which is
 * ingested to Mux for in-app streaming while S3 keeps the download file.
 */

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  try {
    // Raw body — re-serializing JSON changes the bytes and breaks the HMAC.
    const rawBody = await request.text()

    const secret = process.env.MUX_WEBHOOK_SECRET
    if (!secret) {
      console.error('MUX_WEBHOOK_SECRET not configured; rejecting webhook')
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }

    if (!verifyMuxSignature(rawBody, request.headers.get('mux-signature'), secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(rawBody) as {
      type: string
      data?: {
        id?: string
        passthrough?: string
        playback_ids?: { id: string; policy: string }[]
        duration?: number
        errors?: { messages?: string[] }
      }
    }

    const target = parsePassthrough(event.data?.passthrough)

    switch (event.type) {
      case 'video.asset.ready': {
        const playbackId = event.data?.playback_ids?.[0]?.id
        if (!playbackId || !target) {
          // Nothing actionable, but 200 so Mux stops retrying.
          return NextResponse.json({ received: true })
        }

        const supabase = db()

        if (target.kind === 'clip') {
          await supabase
            .from('clip_jobs')
            .update({ mux_playback_id: playbackId })
            .eq('id', target.clip_job_id)
        } else {
          await supabase
            .from('videos')
            .update({ mux_playback_id: playbackId })
            .eq('id', target.video_id)
        }

        return NextResponse.json({ received: true })
      }

      case 'video.asset.errored': {
        if (!target || target.kind !== 'clip') return NextResponse.json({ received: true })

        const message =
          event.data?.errors?.messages?.join('; ') || 'Mux could not process the clip'

        const supabase = db()
        await supabase
          .from('clip_jobs')
          .update({ status: 'failed', error_message: message })
          .eq('id', target.clip_job_id)

        return NextResponse.json({ received: true })
      }

      default:
        // Mux sends plenty of events we don't act on. Acknowledge them all.
        return NextResponse.json({ received: true })
    }
  } catch (error: unknown) {
    console.error('Mux webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
