import type {
  ClipDuration,
  SingleFrameMotion,
  StillMotion,
  TwoFrameMotion,
} from '@/lib/types/database'

/**
 * Human labels for the camera presets.
 *
 * The worker owns what a preset MEANS — motion.py turns each key into the
 * sentence the model reads, and /motions serves the valid keys. It does not
 * serve labels, because prompt language is not interface language: "The camera
 * pushes slowly forward into the space" is the instruction, "Push in" is the
 * control.
 *
 * These are typed as complete records over the unions, so adding a preset to
 * the worker without labelling it here fails the build rather than rendering a
 * blank option.
 */

export const SINGLE_FRAME_MOTION_LABELS: Record<SingleFrameMotion, string> = {
  push_in: 'Push in',
  pull_out: 'Pull out',
  pan_left: 'Pan left',
  pan_right: 'Pan right',
  tilt_up: 'Tilt up',
  tilt_down: 'Tilt down',
  orbit_left: 'Orbit left',
  orbit_right: 'Orbit right',
}

export const TWO_FRAME_MOTION_LABELS: Record<TwoFrameMotion, string> = {
  linear: 'Constant',
  ease: 'Ease in and out',
  accelerate: 'Accelerate',
  hold_then_move: 'Hold, then move',
}

export const STILL_MOTION_LABELS: Record<StillMotion, string> = {
  none: 'Hold still',
  zoom_in: 'Slow zoom in',
  zoom_out: 'Slow zoom out',
  pan_left: 'Drift left',
  pan_right: 'Drift right',
}

/**
 * With one frame the preset says where the camera goes, because nothing else
 * does. With two the endpoints already decide that, so it can only describe how
 * the camera travels between them.
 */
export function motionOptions(hasEndFrame: boolean) {
  return hasEndFrame
    ? Object.entries(TWO_FRAME_MOTION_LABELS)
    : Object.entries(SINGLE_FRAME_MOTION_LABELS)
}

export const DEFAULT_SINGLE_FRAME_MOTION: SingleFrameMotion = 'push_in'
export const DEFAULT_TWO_FRAME_MOTION: TwoFrameMotion = 'ease'

/** Switching frame count invalidates the preset — the two sets don't overlap. */
export function defaultMotionFor(hasEndFrame: boolean) {
  return hasEndFrame ? DEFAULT_TWO_FRAME_MOTION : DEFAULT_SINGLE_FRAME_MOTION
}

export const CLIP_DURATIONS: ClipDuration[] = [4, 6, 8]

/**
 * How long the shot holds, named rather than numbered.
 *
 * The agent is a listing agent, not an editor. "4s" is a spec, not a choice —
 * it says what the system does instead of what they get. The word says how the
 * shot will feel and the number stays beside it, the same way the aggression
 * slider names its zone and still shows its value.
 *
 * Ordered and obvious on sight: no legend, no learning.
 */
export const CLIP_DURATION_LABELS: Record<ClipDuration, string> = {
  4: 'Short',
  6: 'Medium',
  8: 'Long',
}

/**
 * What a length costs, for labelling a button before it is pressed.
 *
 * Mirrors TOKENS_PER_SECOND, which lives in lib/tokens.ts with the service
 * client and a non-public env var and so cannot be imported into a client
 * component. Display only: the server prices the debit and is the authority. If
 * the two ever disagree the button is wrong, not the charge.
 */
export const DISPLAY_TOKENS_PER_SECOND = 100

export function displayTokensFor(seconds: number): number {
  return Math.round(seconds * DISPLAY_TOKENS_PER_SECOND)
}

/** The slider is 0–100; the model is given the zone, not the number. */
export function aggressionZone(value: number): 'Subtle' | 'Balanced' | 'Cinematic' {
  if (value < 33) return 'Subtle'
  if (value < 66) return 'Balanced'
  return 'Cinematic'
}
