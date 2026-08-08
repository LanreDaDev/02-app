"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useTimelineStore, clipFromServer } from "@/lib/stores/useTimelineStore"

const POLL_INTERVAL = 3000

export interface GraphStatus {
  status: "idle" | "running" | "complete" | "partial" | "failed"
  images: { total: number; succeeded: number; failed: number }
  totalClips: number
  generated: number
  failed: number
  needsTopUp: boolean
  balance: number
  affordableClips: number
}

interface ClipPayload {
  id: string
  orderIndex: number
  status: string
  playable: boolean
  src: string | null
  thumbnail: string | null
  error: string | null
}

/**
 * Poll the generation graph and drop each clip into the timeline as it becomes
 * playable.
 *
 * A clip counts as playable only once Mux has returned a playback ID — before
 * that the file exists but has no URL, and adding it would put a broken source
 * in the composition. Polling stops on its own when nothing is left in flight.
 */
export function useProgressiveClips(projectId: string, active: boolean) {
  const addClip = useTimelineStore((s) => s.addClip)
  const setAspectRatio = useTimelineStore((s) => s.setAspectRatio)

  const [graph, setGraph] = useState<GraphStatus | null>(null)
  const knownIds = useRef<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/generate/${projectId}`)
      if (!res.ok) return

      const data = (await res.json()) as GraphStatus & {
        clips: ClipPayload[]
        aspectRatio: "16:9" | "9:16"
      }

      setGraph({
        status: data.status,
        images: data.images,
        totalClips: data.totalClips,
        generated: data.generated,
        failed: data.failed,
        needsTopUp: data.needsTopUp,
        balance: data.balance,
        affordableClips: data.affordableClips,
      })

      if (data.aspectRatio) setAspectRatio(data.aspectRatio)

      for (const clip of data.clips) {
        if (!clip.playable || !clip.src) continue
        if (knownIds.current.has(clip.id)) continue

        knownIds.current.add(clip.id)
        addClip(
          clipFromServer({
            id: clip.id,
            src: clip.src,
            orderIndex: clip.orderIndex,
            thumbnail: clip.thumbnail,
          })
        )
      }

      // Nothing more is coming — stop polling rather than hammering forever.
      const settled = data.status !== "running"
      const allPlayable = data.clips.every((c) => c.playable || c.status === "failed")
      if (settled && allPlayable) stop()
    } catch {
      // Transient failure; the next tick retries.
    }
  }, [projectId, addClip, setAspectRatio, stop])

  useEffect(() => {
    if (!active) {
      stop()
      return
    }

    poll()
    timerRef.current = setInterval(poll, POLL_INTERVAL)

    return stop
  }, [active, poll, stop])

  return graph
}
