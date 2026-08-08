import crypto from 'crypto'

/**
 * Mux playback URLs and webhook signature verification.
 *
 * Every Mux URL in the app is built here so the rendition naming lives in one
 * place — see MUX_MP4_RENDITION below.
 */

/**
 * Which MP4 rendition to play. Mux's older `mp4_support: "standard"` produces
 * low/medium/high; the newer static-renditions API produces names like
 * 720p/1080p/capped-1080p. Defaulting to `high` for standard support, but this
 * is an env var because it depends on which API your Mux account is on — if
 * clips 404, this is the knob.
 */
const MP4_RENDITION = process.env.MUX_MP4_RENDITION || 'high'

/**
 * Progressive MP4. This is what the timeline and the Lambda render use:
 * Remotion's OffthreadVideo needs a plain MP4, and HLS only plays natively in
 * Safari, so an .m3u8 source would break both the editor and the render.
 */
export function muxMp4Url(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}/${MP4_RENDITION}.mp4`
}

/** HLS. Adaptive, but only for a real video player — not for Remotion. */
export function muxHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`
}

/** Thumbnail for clip cards in the timeline strip. */
export function muxThumbnailUrl(playbackId: string, timeSec = 0): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${timeSec}`
}

/** What we stash on a Mux asset so its webhook can be routed back to a row. */
export type MuxPassthrough =
  | { kind: 'clip'; project_id: string; clip_job_id: string }
  | { kind: 'video'; project_id: string; video_id: string }

export function parsePassthrough(raw: string | null | undefined): MuxPassthrough | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed?.kind === 'clip' && parsed.clip_job_id) return parsed as MuxPassthrough
    if (parsed?.kind === 'video' && parsed.video_id) return parsed as MuxPassthrough
    return null
  } catch {
    // Legacy `{project_id}:{clip_job_id}` form from before passthrough was JSON.
    const parts = raw.split(':')
    if (parts.length === 2) {
      return { kind: 'clip', project_id: parts[0], clip_job_id: parts[1] }
    }
    return null
  }
}

/**
 * Verify a Mux webhook signature.
 *
 * Header is `Mux-Signature: t=<unix-seconds>,v1=<hex hmac>`, where the HMAC is
 * over `${timestamp}.${rawBody}`. Requires the RAW body — parsing to JSON and
 * re-stringifying changes the bytes and the signature will never match.
 */
export function verifyMuxSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300
): boolean {
  if (!signatureHeader || !secret) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=')
      return [k?.trim(), v?.trim()]
    })
  ) as { t?: string; v1?: string }

  if (!parts.t || !parts.v1) return false

  // Reject stale signatures so a captured request can't be replayed later.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t))
  if (!Number.isFinite(age) || age > toleranceSeconds) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(parts.v1, 'utf8')
  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}
