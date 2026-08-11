import { create } from 'zustand'
import type { SlotWithTakes } from '@/lib/types/database'

/**
 * The editor's authoring state: the slots in a project, and which one is
 * selected.
 *
 * Selection lives HERE and nowhere else. The rail, the timeline and the
 * inspector all address the same object, and the moment any of them keeps its
 * own idea of what is selected the three drift apart — the rail highlights one
 * card while the inspector edits another.
 *
 * That is not hypothetical. The timeline store used to hold an `activeClipId`
 * alongside this, and because a clip is a TAKE rather than a slot, the action
 * bar's regenerate button handed a take's id to an endpoint expecting a slot's.
 * It addressed a row that could not exist. Two selections is not a style
 * question; it is how that bug was written.
 *
 * So the invariant is structural rather than stated: there is exactly one
 * selection field in the app, it holds a SLOT id, and every surface that draws
 * a highlight derives it from here. A timeline clip is selected when its
 * `slotId` matches — never by identity of its own.
 */

/**
 * What the player plays.
 *
 * Reviewing a shot and reviewing a sequence are different jobs. Judging whether
 * the kitchen push-in is too aggressive means watching that four seconds over
 * and over; judging whether the video flows means watching all of it. Doing the
 * first with the second's playback — scrub, find it, watch it, scrub back —
 * is what makes reviewing twenty shots feel like work.
 */
export type PlaybackScope = 'clip' | 'video'

interface EditorState {
  slots: SlotWithTakes[]

  /** The one selection. A slot id, never a take id. */
  selectedSlotId: string | null

  playbackScope: PlaybackScope
  setPlaybackScope: (scope: PlaybackScope) => void

  setSlots: (slots: SlotWithTakes[]) => void
  /** Insert or replace by id, keeping the list in rail order. */
  upsertSlot: (slot: SlotWithTakes) => void
  removeSlot: (id: string) => void
  reorderSlots: (orderedIds: string[]) => void

  select: (id: string | null) => void

  selectedSlot: () => SlotWithTakes | null
  /** True when this take's slot is the selected one — the only way a clip highlights. */
  isSlotSelected: (slotId: string | null | undefined) => boolean
}

const byPosition = (a: SlotWithTakes, b: SlotWithTakes) => a.position - b.position

export const useEditorStore = create<EditorState>((set, get) => ({
  slots: [],
  selectedSlotId: null,
  playbackScope: 'video',

  setPlaybackScope: (playbackScope) => set({ playbackScope }),

  setSlots: (slots) =>
    set((s) => {
      const next = [...slots].sort(byPosition)
      // A refetch that no longer contains the selected slot must not leave the
      // inspector editing something that is gone.
      const stillThere = next.some((slot) => slot.id === s.selectedSlotId)
      return { slots: next, selectedSlotId: stillThere ? s.selectedSlotId : null }
    }),

  upsertSlot: (slot) =>
    set((s) => {
      const exists = s.slots.some((x) => x.id === slot.id)
      const next = exists
        ? s.slots.map((x) => (x.id === slot.id ? slot : x))
        : [...s.slots, slot]
      return { slots: next.sort(byPosition) }
    }),

  removeSlot: (id) =>
    set((s) => ({
      slots: s.slots.filter((x) => x.id !== id),
      // Deleting what you were editing clears the inspector rather than
      // leaving it pointed at a row that no longer exists.
      selectedSlotId: s.selectedSlotId === id ? null : s.selectedSlotId,
    })),

  // Rail order only. The timeline's order is the composition's, and moving a
  // clip there must not disturb the grouping the agent built here.
  reorderSlots: (orderedIds) =>
    set((s) => {
      const map = new Map(s.slots.map((x) => [x.id, x]))
      const next = orderedIds
        .map((id) => map.get(id))
        .filter((x): x is SlotWithTakes => Boolean(x))
        .map((slot, i) => ({ ...slot, position: i }))
      return { slots: next }
    }),

  // Deselecting returns to the whole video, because that is what nothing
  // selected means everywhere else in the editor — the inspector shows the
  // project, so the player should show the project. "This clip" with no clip
  // is not a state worth being able to reach.
  select: (id) =>
    set((s) => ({
      selectedSlotId: id,
      playbackScope: id === null ? 'video' : s.playbackScope,
    })),

  selectedSlot: () => {
    const { slots, selectedSlotId } = get()
    return slots.find((s) => s.id === selectedSlotId) ?? null
  },

  isSlotSelected: (slotId) => Boolean(slotId) && get().selectedSlotId === slotId,
}))
