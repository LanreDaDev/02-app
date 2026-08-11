import type { SlotTake, SlotWithTakes } from '@/lib/types/database'

/**
 * Which settings changed since a take was generated.
 *
 * A take records what it was made with (clip_jobs.params). Comparing that to
 * the slot's current values is the only way to tell the agent that what they
 * are watching is no longer what the panel describes — otherwise they change
 * the camera, see nothing happen, and conclude the control is broken.
 *
 * The old take keeps playing. Nothing is discarded for being out of date;
 * regenerating is a purchase and it stays the agent's decision.
 */

/** The five fields a generation actually consumes. Nothing else can go stale. */
const WATCHED = [
  ['start_photo_id', 'the start frame'],
  ['end_photo_id', 'the end frame'],
  ['camera_motion', 'camera motion'],
  ['motion_aggression', 'motion aggression'],
  ['duration_seconds', 'length'],
] as const

export function changedSince(
  slot: SlotWithTakes,
  take: SlotTake | null
): string[] {
  // A still never generates, and a slot with no take has nothing to be stale
  // against — both are "not dirty" rather than "unknown".
  if (!take || slot.kind === 'still') return []

  const params = take.params
  // A take from before params were recorded can't be compared. Treating that as
  // dirty would nag about a change nobody made.
  if (!params || typeof params !== 'object') return []

  const changed: string[] = []
  for (const [key, label] of WATCHED) {
    const was = (params as Record<string, unknown>)[key]
    // An absent key means this take predates the field; not a change.
    if (was === undefined) continue
    if (was !== slot[key]) changed.push(label)
  }
  return changed
}

/** "camera motion and length" — for a sentence, not a list. */
export function joinChanges(changes: string[]): string {
  if (changes.length <= 1) return changes[0] ?? ''
  if (changes.length === 2) return `${changes[0]} and ${changes[1]}`
  return `${changes.slice(0, -1).join(', ')} and ${changes[changes.length - 1]}`
}
