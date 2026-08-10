"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ZoomIn, ZoomOut } from "lucide-react"
import { useTimelineStore } from "@/lib/stores/useTimelineStore"
import { useEditorStore } from "@/lib/stores/useEditorStore"
import { FPS } from "@/lib/remotion/constants"
import { cn } from "@/lib/utils"
import { TimelineClipBlock } from "./TimelineClip"
import type { RemotionPlayerHandle } from "./RemotionPlayer"

const MIN_PPS = 20
const MAX_PPS = 260
const DEFAULT_PPS = 90

/** Tick spacing options, in seconds. The first one that gives >= 56px wins. */
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60]

interface TimelineTrackProps {
  playerRef: React.RefObject<RemotionPlayerHandle | null>
  /** Takes a SLOT id — regenerating asks the slot for another take. */
  onRegen?: (slotId: string) => void
}

export function TimelineTrack({ playerRef, onRegen }: TimelineTrackProps) {
  const clips = useTimelineStore((s) => s.clips)
  const setTrim = useTimelineStore((s) => s.setTrim)
  const reorderClips = useTimelineStore((s) => s.reorderClips)

  // Selection is the slot's, shared with the rail and the inspector. A clip
  // never holds one of its own.
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)
  const select = useEditorStore((s) => s.select)

  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PPS)
  const [playhead, setPlayhead] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const totalFrames = useMemo(
    () => clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0),
    [clips]
  )
  const totalSeconds = totalFrames / FPS
  const trackWidth = totalSeconds * pxPerSecond

  // Follow playback rather than polling, so the playhead never drifts.
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    return player.onFrame(setPlayhead)
  }, [playerRef, clips.length])

  // Keep the playhead on screen while playing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const x = (playhead / FPS) * pxPerSecond
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: "smooth" })
    }
  }, [playhead, pxPerSecond])

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const x = clientX - rect.left + el.scrollLeft
      const frame = Math.round((x / pxPerSecond) * FPS)
      playerRef.current?.seekToFrame(Math.max(0, Math.min(frame, totalFrames - 1)))
    },
    [pxPerSecond, totalFrames, playerRef]
  )

  /** Click or drag anywhere on the ruler to scrub. */
  function startScrub(e: React.PointerEvent) {
    seekFromPointer(e.clientX)

    const move = (ev: PointerEvent) => seekFromPointer(ev.clientX)
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const handleReorder = useCallback(
    (from: number, to: number) => {
      const clamped = Math.max(0, Math.min(to, clips.length - 1))
      if (clamped === from) return

      const ids = clips.map((c) => c.id)
      const [moved] = ids.splice(from, 1)
      ids.splice(clamped, 0, moved)
      reorderClips(ids)
    },
    [clips, reorderClips]
  )

  // Ctrl/⌘ + wheel zooms, matching every other timeline tool.
  function handleWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setPxPerSecond((p) => clamp(p - e.deltaY * 0.5, MIN_PPS, MAX_PPS))
  }

  const tickStep = useMemo(() => {
    return TICK_STEPS.find((s) => s * pxPerSecond >= 56) ?? TICK_STEPS[TICK_STEPS.length - 1]
  }, [pxPerSecond])

  const ticks = useMemo(() => {
    const out: number[] = []
    for (let t = 0; t <= totalSeconds + 0.001; t += tickStep) out.push(t)
    return out
  }, [totalSeconds, tickStep])

  if (clips.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTimecode(playhead)} <span className="text-muted-foreground/50">/</span>{" "}
          {formatTimecode(totalFrames)}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPxPerSecond((p) => clamp(p / 1.4, MIN_PPS, MAX_PPS))}
            disabled={pxPerSecond <= MIN_PPS}
            aria-label="Zoom out"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            onClick={() => setPxPerSecond((p) => clamp(p * 1.4, MIN_PPS, MAX_PPS))}
            disabled={pxPerSecond >= MAX_PPS}
            aria-label="Zoom in"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="relative overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        <div style={{ width: Math.max(trackWidth, 1) }} className="relative min-w-full">
          {/* Ruler — click or drag to scrub */}
          <div
            onPointerDown={startScrub}
            role="slider"
            aria-label="Playhead position"
            aria-valuemin={0}
            aria-valuemax={Math.round(totalSeconds)}
            aria-valuenow={Math.round(playhead / FPS)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") playerRef.current?.seekToFrame(Math.max(0, playhead - 1))
              if (e.key === "ArrowRight")
                playerRef.current?.seekToFrame(Math.min(totalFrames - 1, playhead + 1))
            }}
            className="relative h-7 cursor-pointer select-none border-b border-border bg-muted/40"
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 flex h-full items-start"
                style={{ left: t * pxPerSecond }}
              >
                <div className="h-2 w-px bg-border" />
                <span className="ml-1 mt-0.5 font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                  {formatTick(t)}
                </span>
              </div>
            ))}
          </div>

          {/* Clips */}
          <div className="flex items-center gap-0.5 p-2">
            {clips.map((clip, i) => (
              <TimelineClipBlock
                key={clip.id}
                clip={clip}
                index={i}
                isActive={Boolean(clip.slotId) && clip.slotId === selectedSlotId}
                pxPerSecond={pxPerSecond}
                onSelect={() => {
                  select(clip.slotId ?? null)
                  const startFrame = clips
                    .slice(0, i)
                    .reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0)
                  playerRef.current?.seekToFrame(startFrame)
                }}
                onTrim={(inF, outF) => setTrim(clip.id, inF, outF)}
                onReorder={handleReorder}
                // The slot, not the take — regenerating asks for another result
                // for the same clip, not a copy of an existing one.
                onRegen={onRegen && clip.slotId ? () => onRegen(clip.slotId!) : undefined}
              />
            ))}
          </div>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary"
            style={{ left: (playhead / FPS) * pxPerSecond }}
          >
            <div className="absolute -left-[5px] top-0 size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-primary" />
          </div>
        </div>
      </div>

      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        Drag clip edges to trim · drag a clip to reorder · {"⌘"}-scroll to zoom
      </p>
    </div>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function formatTimecode(frames: number) {
  const totalSec = frames / FPS
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  const f = Math.floor(frames % FPS)
  return `${m}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`
}

function formatTick(t: number) {
  if (t < 60) return `${t % 1 === 0 ? t : t.toFixed(1)}s`
  const m = Math.floor(t / 60)
  const s = Math.round(t % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}
