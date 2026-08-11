'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/lib/stores/useEditorStore'
import { deriveSlotState } from '@/lib/editor/slotState'
import type { SlotKind, SlotWithTakes } from '@/lib/types/database'

/**
 * Loads a project's slots into the editor store and keeps them fresh.
 *
 * Polls only while something is actually generating. A slot's work is one task
 * now rather than a graph, so there is no intermediate state to watch and
 * nothing to reconcile — the rail is either waiting on a take or it is idle,
 * and idle needs no traffic.
 */

const POLL_MS = 4000

/**
 * How long a deleted clip can be brought back.
 *
 * Nothing is sent until this runs out — the row is still there, and the delete
 * is a timer the agent can cancel. That matters more here than in most places
 * because a slot's takes were paid for, and the cascade takes them with it.
 */
const UNDO_MS = 7000

/** A clip that has left the rail but not yet the database. */
export interface PendingDelete {
  id: string
  name: string
  /** Takes that go with it. Worth naming — they cost real money. */
  takes: number
}

export function useSlots(projectId: string) {
  const setSlots = useEditorStore((s) => s.setSlots)
  const slots = useEditorStore((s) => s.slots)
  const upsertSlot = useEditorStore((s) => s.upsertSlot)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  // Survives re-renders so the poll effect doesn't restart on every fetch.
  const inFlight = useRef(false)
  // The whole row, held so undo can put it back exactly as it was.
  const heldDelete = useRef<{ slot: SlotWithTakes; timer: ReturnType<typeof setTimeout> } | null>(
    null
  )

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch(`/api/projects/${projectId}/slots`)
      if (!res.ok) throw new Error(`Could not load clips (${res.status})`)
      const data = (await res.json()) as { slots: SlotWithTakes[] }
      // A clip waiting out its undo window is still on the server. Without this
      // the next poll marches it straight back onto the rail.
      const hidden = heldDelete.current?.slot.id
      setSlots((data.slots ?? []).filter((s) => s.id !== hidden))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load clips')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [projectId, setSlots])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A slot mid-generation is the only reason to keep asking.
  const pending = slots.some((s) => s.state === 'queued' || s.state === 'running')

  useEffect(() => {
    if (!pending) return
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [pending, refresh])

  /**
   * Add a slot. Returns it so the caller can select it immediately — a new card
   * the agent has to go and find is a card they did not ask for.
   */
  const addSlot = useCallback(
    async (kind: SlotKind = 'generated') => {
      const res = await fetch(`/api/projects/${projectId}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not add a clip')
      }
      // The route answers { slot }, not the slot. Unwrapping the envelope is
      // not a tidy-up: reading it as the slot gave every new card an undefined
      // id, so selecting it addressed /api/slots/undefined and every edit came
      // back "Clip not found" — on a card sitting right there in the rail.
      const { slot } = (await res.json()) as { slot: SlotWithTakes }
      if (!slot?.id) throw new Error('Could not add a clip')

      // Insert locally rather than refetching: the rail should show the card
      // the moment it is clicked, not a network round-trip later.
      upsertSlot({ ...slot, takes: [], activeTake: null, state: 'draft' })
      return slot
    },
    [projectId, upsertSlot]
  )

  /**
   * Edit a slot. Applies locally first — a slider that waits for a round-trip
   * before moving reads as broken, and every field here is cheap to undo.
   *
   * The server is authoritative on what it stores, so its row replaces the
   * optimistic one on the way back; a rejected edit reverts to what was there.
   */
  const patchSlot = useCallback(
    async (slotId: string, patch: Record<string, unknown>) => {
      const before = useEditorStore.getState().slots.find((s) => s.id === slotId)
      if (!before) return

      const optimistic = { ...before }
      // Only the fields the inspector can change, mapped to their column names.
      if ('name' in patch) optimistic.name = patch.name as string
      if ('kind' in patch) optimistic.kind = patch.kind as typeof before.kind
      if ('startPhotoId' in patch) optimistic.start_photo_id = patch.startPhotoId as string | null
      if ('endPhotoId' in patch) optimistic.end_photo_id = patch.endPhotoId as string | null
      if ('cameraMotion' in patch)
        optimistic.camera_motion = patch.cameraMotion as typeof before.camera_motion
      if ('motionAggression' in patch)
        optimistic.motion_aggression = patch.motionAggression as number
      if ('durationSeconds' in patch)
        optimistic.duration_seconds = patch.durationSeconds as typeof before.duration_seconds
      if ('holdDurationSeconds' in patch)
        optimistic.hold_duration_seconds = patch.holdDurationSeconds as number
      if ('stillMotion' in patch)
        optimistic.still_motion = patch.stillMotion as typeof before.still_motion

      // State is derived from kind and start_photo_id, both of which are edited
      // here — carrying the old one over would leave a still that just got its
      // photo still reading "Needs a photo".
      optimistic.state = deriveSlotState(optimistic, optimistic.activeTake)

      useEditorStore.getState().upsertSlot(optimistic)

      try {
        const res = await fetch(`/api/slots/${slotId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? 'Could not save that change')
        }
        const saved = (await res.json()) as SlotWithTakes
        // Keep the takes we already have: PATCH returns the slot row, not its
        // history, and dropping them would blank the card mid-edit.
        useEditorStore.getState().upsertSlot({
          ...saved,
          takes: before.takes,
          activeTake: before.activeTake,
          state: deriveSlotState(saved, before.activeTake),
        })
      } catch (e) {
        useEditorStore.getState().upsertSlot(before)
        throw e
      }
    },
    []
  )

  /**
   * Make an earlier take the active one. Instant — no generation, no charge.
   *
   * Applied locally first so the switch feels like what it is: picking between
   * results that already exist, rather than requesting something.
   */
  const selectTake = useCallback(
    async (slotId: string, takeId: string) => {
      const before = useEditorStore.getState().slots.find((s) => s.id === slotId)
      if (!before) return

      const next = before.takes.find((t) => t.id === takeId)
      if (!next) return

      useEditorStore.getState().upsertSlot({
        ...before,
        takes: before.takes.map((t) => ({ ...t, is_current: t.id === takeId })),
        activeTake: { ...next, is_current: true },
        state: deriveSlotState(before, next),
      })

      try {
        const res = await fetch(`/api/slots/${slotId}/take`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ takeId }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? 'Could not switch take')
        }
      } catch (e) {
        useEditorStore.getState().upsertSlot(before)
        throw e
      }
    },
    []
  )

  /**
   * Send the delete for real. Only ever called by the timer, by a second delete,
   * or on the way out — never directly by the agent.
   */
  const commit = useCallback(async (slot: SlotWithTakes) => {
    try {
      const res = await fetch(`/api/slots/${slot.id}`, {
        method: 'DELETE',
        // Survives the request if the tab closes inside the undo window.
        keepalive: true,
      })
      if (!res.ok) throw new Error('Could not delete the clip')
    } catch {
      // The delete failed, so the clip still exists. Put it back rather than
      // leaving the rail claiming something that is still there is gone.
      useEditorStore.getState().upsertSlot(slot)
      setError('Could not delete that clip — it is still here.')
    }
  }, [])

  /** Fire any waiting delete now, without waiting out its window. */
  const flushPending = useCallback(() => {
    const p = heldDelete.current
    if (!p) return
    clearTimeout(p.timer)
    heldDelete.current = null
    setPendingDelete(null)
    void commit(p.slot)
  }, [commit])

  /**
   * Remove a clip, reversibly.
   *
   * The row leaves the rail at once and the request is held for UNDO_MS. That
   * ordering is the point: a confirmation dialog asks the agent to be certain
   * before they can see what happens, and an undo lets them look first.
   *
   * Selection moves to the next clip rather than clearing, so ⌫ during a review
   * pass leaves you on the following shot and the walk carries on.
   */
  const deleteSlot = useCallback(
    (slotId: string) => {
      // One at a time. A second delete commits the first rather than queueing,
      // which keeps "Undo" meaning the thing that just happened.
      flushPending()

      const store = useEditorStore.getState()
      const index = store.slots.findIndex((s) => s.id === slotId)
      if (index === -1) return

      const slot = store.slots[index]
      const neighbour = store.slots[index + 1] ?? store.slots[index - 1] ?? null

      store.removeSlot(slotId)
      if (store.selectedSlotId === slotId) store.select(neighbour?.id ?? null)

      const timer = setTimeout(() => {
        heldDelete.current = null
        setPendingDelete(null)
        void commit(slot)
      }, UNDO_MS)

      heldDelete.current = { slot, timer }
      setPendingDelete({ id: slot.id, name: slot.name, takes: slot.takes.length })
    },
    [commit, flushPending]
  )

  const undoDelete = useCallback(() => {
    const p = heldDelete.current
    if (!p) return
    clearTimeout(p.timer)
    heldDelete.current = null
    setPendingDelete(null)
    // upsertSlot re-sorts by position, so it lands back where it was rather
    // than at the end of the rail.
    useEditorStore.getState().upsertSlot(p.slot)
    useEditorStore.getState().select(p.slot.id)
  }, [])

  // Leaving the editor commits whatever is still waiting. The alternative is a
  // clip the agent deleted quietly reappearing the next time they open the
  // project, which reads as the delete having failed.
  useEffect(() => {
    const onHide = () => flushPending()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      onHide()
    }
  }, [flushPending])

  return {
    slots,
    loading,
    error,
    refresh,
    addSlot,
    patchSlot,
    selectTake,
    deleteSlot,
    undoDelete,
    pendingDelete,
    undoWindowMs: UNDO_MS,
  }
}
