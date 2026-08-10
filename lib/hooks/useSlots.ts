'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/lib/stores/useEditorStore'
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

  return { slots, loading, error, refresh, addSlot }
}
