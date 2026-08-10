import type { SlotState, SlotTake, SlotWithTakes } from '@/lib/types/database'

/**
 * Derive a slot's rail state.
 *
 * Mirrors slotState() in the slots route, which is the authority — this exists
 * because the state is derived from fields the inspector can change, so
 * preserving the old value across an edit makes the card lie. Giving a still
 * its photo turns it ready immediately; the card should say so rather than
 * reading "Needs a photo" until the next poll lands.
 *
 * Stills never queue, generate, fail or go stale, which is the whole reason
 * this is one function and not a status flag per kind.
 */
export function deriveSlotState(
  slot: Pick<SlotWithTakes, 'kind' | 'start_photo_id'>,
  activeTake: Pick<SlotTake, 'status'> | null
): SlotState {
  if (!slot.start_photo_id) return 'draft'
  if (slot.kind === 'still') return 'ready'
  if (!activeTake) return 'draft'

  switch (activeTake.status) {
    case 'succeeded':
      return 'ready'
    case 'failed':
      return 'failed'
    case 'running':
      return 'running'
    default:
      return 'queued'
  }
}
