import { FPS } from '@/lib/remotion/constants'
import type { TimelineClipProps } from '@/lib/remotion/types'
import type { SlotWithTakes } from '@/lib/types/database'

/**
 * How long the video runs.
 *
 * Derived, never stored, and computed in exactly one place — the top bar, the
 * project panel and the timeline all show this number, and three surfaces each
 * doing their own arithmetic is how they end up disagreeing by a few tenths and
 * making the agent wonder which one is lying.
 *
 * A slot with a take contributes what that take was trimmed to. A slot without
 * one contributes the length it is set to, so the total does not climb as jobs
 * land. A still is exact either way: there is no take for it to be wrong about.
 */
export function runtimeSeconds(
  slots: SlotWithTakes[],
  clips: TimelineClipProps[]
): number {
  // No slots yet — fall back to whatever the composition holds, so the number
  // is still right before slots have loaded.
  if (slots.length === 0) {
    return clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame) / FPS, 0)
  }

  const bySlot = new Map(clips.map((c) => [c.slotId, c]))

  return slots.reduce((acc, slot) => {
    const clip = bySlot.get(slot.id)
    if (clip) return acc + (clip.outFrame - clip.inFrame) / FPS
    return (
      acc + (slot.kind === 'still' ? slot.hold_duration_seconds : slot.duration_seconds)
    )
  }, 0)
}
