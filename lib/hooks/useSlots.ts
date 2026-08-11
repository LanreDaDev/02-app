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

export function useSlots(projectId: string) {
  const setSlots = useEditorStore((s) => s.setSlots)
  const slots = useEditorStore((s) => s.slots)
  const upsertSlot = useEditorStore((s) => s.upsertSlot)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Survives re-renders so the poll effect doesn't restart on every fetch.
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch(`/api/projects/${projectId}/slots`)
      if (!res.ok) throw new Error(`Could not load clips (${res.status})`)
      const data = (await res.json()) as { slots: SlotWithTakes[] }
      setSlots(data.slots ?? [])
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
      const slot = (await res.json()) as SlotWithTakes
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

  return { slots, loading, error, refresh, addSlot, patchSlot, selectTake }
}
