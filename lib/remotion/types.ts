export interface TimelineClipProps {
  id: string
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
}

export interface CompositionProps {
  clips: TimelineClipProps[]
  fps: number
  width: number
  height: number
}
