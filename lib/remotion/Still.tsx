import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion'
import type { StillMotion } from '../types/database'

/**
 * A photograph held on screen.
 *
 * Stills exist because not every shot should be generated. An exterior, a floor
 * plan, a closing frame with the agent's own photograph of the front door —
 * paying Veo to animate those buys nothing. The slot model has always allowed
 * them; until now the composition could not render one, so a still sat on the
 * timeline as a dashed ghost labelled "Ready" and then vanished from the export.
 *
 * The movement is the same Ken Burns vocabulary every listing video uses, and it
 * is deliberately slight. A still that drifts hard reads as a still that is
 * trying to pass for footage; a still that drifts a little just reads as alive.
 */

/**
 * How far past the frame the image is blown up before it moves.
 *
 * Panning a 1.0-scaled image would drag its edge into shot and expose the
 * background behind it. Everything below stays inside this margin.
 */
const OVERSCAN = 1.08

/** Sideways travel, as a fraction of frame width. Half the overscan, so safe. */
const DRIFT = 0.03

interface Move {
  scale: [number, number]
  x: [number, number]
}

/**
 * "Drift left" means the picture slides left, the way it reads to someone who
 * has never used an editor — not the camera-operator's sense, where panning left
 * moves the image right.
 */
const MOVES: Record<StillMotion, Move> = {
  none: { scale: [1, 1], x: [0, 0] },
  zoom_in: { scale: [1, OVERSCAN], x: [0, 0] },
  zoom_out: { scale: [OVERSCAN, 1], x: [0, 0] },
  pan_left: { scale: [OVERSCAN, OVERSCAN], x: [DRIFT, -DRIFT] },
  pan_right: { scale: [OVERSCAN, OVERSCAN], x: [-DRIFT, DRIFT] },
}

export const Still: React.FC<{
  src: string
  motion?: StillMotion
  durationInFrames: number
}> = ({ src, motion, durationInFrames }) => {
  const frame = useCurrentFrame()
  const move = MOVES[motion ?? 'none'] ?? MOVES.none

  // A one-frame still would divide by zero. Clamped at both ends so a render
  // that overruns by a frame holds the final framing rather than overshooting.
  const span: [number, number] = [0, Math.max(1, durationInFrames - 1)]
  const opts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

  const scale = interpolate(frame, span, move.scale, opts)
  const x = interpolate(frame, span, move.x, opts)

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#08080a' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          // Cover, not contain. These are the agent's own listing photos at
          // whatever aspect their camera shot — letterboxing one in the middle
          // of a cinematic walkthrough looks like a fault in the video.
          objectFit: 'cover',
          transform: `scale(${scale}) translateX(${x * 100}%)`,
        }}
      />
    </AbsoluteFill>
  )
}
