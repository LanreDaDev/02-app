"use client"

import { useEffect, useRef } from "react"
import { useTimelineStore } from "@/lib/stores/useTimelineStore"

const DEBOUNCE_MS = 1200

/**
 * Persist the timeline edit as the user works.
 *
 * The edit — clip order and in/out points — IS the Remotion composition that
 * finalize renders. Without this, a reload silently discards every trim the user
 * made. Debounced, because trimming fires on every pointer move.
 */
export function useCompositionAutosave(projectId: string, enabled: boolean) {
  const clips = useTimelineStore((s) => s.clips)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef<string>("")

  useEffect(() => {
    if (!enabled || clips.length === 0) return

    const payload = clips.map((c, i) => ({
      clipJobId: c.id,
      orderIndex: i,
      inFrame: c.inFrame,
      outFrame: c.outFrame,
    }))

    const serialized = JSON.stringify(payload)
    if (serialized === lastSaved.current) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      lastSaved.current = serialized

      fetch(`/api/projects/${projectId}/composition`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips: payload }),
        // Survives the request if the user navigates away mid-save.
        keepalive: true,
      }).catch(() => {
        // Let the next edit retry rather than surfacing a toast for an autosave.
        lastSaved.current = ""
      })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [clips, projectId, enabled])
}
