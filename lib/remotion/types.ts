// Relative, not aliased: this file is bundled by Remotion for Lambda, which does
// not read Next's `@/` paths. Type-only, so nothing survives compilation anyway.
import type { StillMotion } from '../types/database'

/**
 * What a timeline item is made of.
 *
 * A still is not a degenerate video. It has no source to trim against, no take
 * behind it and no encode — it is a photograph held on screen. Giving the
 * composition a discriminator is what lets it be first-class instead of being
 * approximated with a one-frame clip.
 */
export type TimelineItemKind = 'video' | 'still'

export interface TimelineClipProps {
  id: string
  kind: TimelineItemKind
  /** A Mux MP4 for a video; a photo URL for a still. */
  src: string
  durationInFrames: number
  inFrame: number
  outFrame: number
  /**
   * Position in the generated sequence. Clips finish out of order — clip 3 can
   * beat clip 1 — so arrival order is not timeline order.
   */
  orderIndex: number
  /** The slot this take belongs to — what a regenerate actually targets. */
  slotId?: string
  thumbnail?: string | null
  /** Stills only: how the frame moves while it holds. */
  stillMotion?: StillMotion
}

export interface CompositionProps {
  clips: TimelineClipProps[]
  fps: number
  width: number
  height: number
}
