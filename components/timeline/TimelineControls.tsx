"use client"

import { useEffect, useMemo, useState } from "react"
import { Play, Pause, SkipBack, SkipForward } from "lucide-react"
import { useTimelineStore } from "@/lib/stores/useTimelineStore"
import { FPS } from "@/lib/remotion/constants"
import type { RemotionPlayerHandle } from "./RemotionPlayer"

interface TimelineControlsProps {
  playerRef: React.RefObject<RemotionPlayerHandle | null>
}

export function TimelineControls({ playerRef }: TimelineControlsProps) {
  const clips = useTimelineStore((s) => s.clips)
  const [playing, setPlaying] = useState(false)

  const totalFrames = useMemo(
    () => clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0),
    [clips]
  )

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    return player.onPlayStateChange(setPlaying)
  }, [playerRef, clips.length])

  // Space toggles playback, unless the user is typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (el?.isContentEditable) return

      if (e.code === "Space") {
        e.preventDefault()
        playerRef.current?.toggle()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [playerRef])

  if (clips.length === 0) return null

  const totalSec = (totalFrames / FPS).toFixed(1)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => playerRef.current?.seekToFrame(0)}
        aria-label="Jump to start"
        className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SkipBack className="size-3.5" />
      </button>

      <button
        onClick={() => playerRef.current?.toggle()}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>

      <button
        onClick={() => playerRef.current?.seekToFrame(Math.max(0, totalFrames - 1))}
        aria-label="Jump to end"
        className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SkipForward className="size-3.5" />
      </button>

      <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground">
        {totalSec}s · {clips.length} clip{clips.length !== 1 ? "s" : ""}
      </span>
    </div>
  )
}
