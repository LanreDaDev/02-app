"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const POLL_INTERVAL = 3000

export interface RenderStatus {
  status: "none" | "rendering" | "ready" | "failed"
  videoId?: string
  durationSec?: number | null
  /** The rendered MP4 in S3 — the download artifact. */
  downloadUrl: string | null
  /** Mux HLS for the in-app player. */
  streamUrl: string | null
  /** Mux progressive MP4, for anything that can't do HLS. */
  mp4Url?: string | null
  error?: string | null
}

/**
 * Poll the finalized render.
 *
 * A render is only fully done when the S3 file exists AND Mux has produced a
 * playback ID — the two arrive independently, so polling continues until both
 * are present rather than stopping at the first "ready".
 */
export function useRenderStatus(projectId: string, active: boolean) {
  const [render, setRender] = useState<RenderStatus | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/video`)
      if (!res.ok) return

      const data = (await res.json()) as RenderStatus
      setRender(data)

      if (data.status === "failed") stop()
      if (data.status === "ready" && data.streamUrl) stop()
    } catch {
      // Transient; the next tick retries.
    }
  }, [projectId, stop])

  useEffect(() => {
    if (!active) {
      stop()
      return
    }

    poll()
    timerRef.current = setInterval(poll, POLL_INTERVAL)
    return stop
  }, [active, poll, stop])

  return { render, refetch: poll }
}
