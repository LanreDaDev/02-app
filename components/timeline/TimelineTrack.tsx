"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ZoomIn, ZoomOut } from "lucide-react"
import { useTimelineStore } from "@/lib/stores/useTimelineStore"
import { useEditorStore } from "@/lib/stores/useEditorStore"
import { FPS } from "@/lib/remotion/constants"
import { cn } from "@/lib/utils"
import { TimelineClipBlock } from "./TimelineClip"
import type { RemotionPlayerHandle } from "./RemotionPlayer"
import { runtimeSeconds } from "@/lib/editor/runtime"
import type { SlotKind, SlotState } from "@/lib/types/database"

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
  // Slots, not just clips: a slot with no take yet still holds its place.
  const slots = useEditorStore((s) => s.slots)

  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PPS)
  const [playhead, setPlayhead] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const totalFrames = useMemo(
    () => clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0),
    [clips]
  )

  /**
   * The spine: every slot in order, as either its ready take or a ghost.
   *
   * A slot without a take still occupies the sequence — it is a shot the agent
   * has decided on. Leaving it off the spine makes the runtime climb every time
   * a job lands, which reads as a bug rather than as progress.
   *
   * Falls back to clips alone when there are no slots, so the composition still
   * renders if slots have not loaded.
   */
  const spine = useMemo(() => {
    const byId = new Map(clips.map((c, i) => [c.slotId, { clip: c, index: i }]))

    if (slots.length === 0) {
      return clips.map((clip, index) => ({
        key: clip.id,
        seconds: (clip.outFrame - clip.inFrame) / FPS,
        clip,
        index,
        slot: null,
      }))
    }

    return slots.map((slot) => {
      const hit = byId.get(slot.id)
      const seconds = hit
        ? (hit.clip.outFrame - hit.clip.inFrame) / FPS
        : // The estimate. A still is exact — it has no take to be wrong about.
          slot.kind === 'still'
          ? slot.hold_duration_seconds
          : slot.duration_seconds
      return {
        key: slot.id,
        seconds,
        clip: hit?.clip ?? null,
        index: hit?.index ?? -1,
        slot,
      }
    })
  }, [slots, clips])

  // Same figure as the top bar and the project panel, from the same function.
  // The spine's own widths sum to this by construction; going through
  // runtimeSeconds keeps the three surfaces provably in step.
  const totalSeconds = useMemo(() => runtimeSeconds(slots, clips), [slots, clips])
  const trackWidth = totalSeconds * pxPerSecond

  // Follow playback rather than polling, so the playhead never drifts.
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    return player.onFrame(setPlayhead)
  }, [playerRef, clips.length])

  /**
   * Composition time only advances through real clips, but ghosts take up width
   * on the spine. Mapping frames straight to x would drift the playhead further
   * out of place with every ghost to its left, so both are walked together.
   */
  const playheadX = useMemo(() => {
    let frames = 0
    let x = 0
    for (const item of spine) {
      const w = item.seconds * pxPerSecond
      if (item.clip) {
        const clipFrames = item.clip.outFrame - item.clip.inFrame
        if (playhead < frames + clipFrames) {
          return x + ((playhead - frames) / clipFrames) * w
        }
        frames += clipFrames
      }
      x += w
    }
    return x
  }, [spine, playhead, pxPerSecond])

  // Keep the playhead on screen while playing.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    if (playheadX < el.scrollLeft || playheadX > el.scrollLeft + el.clientWidth - 40) {
      el.scrollTo({ left: Math.max(0, playheadX - el.clientWidth / 2), behavior: "smooth" })
    }
  }, [playheadX])

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const x = clientX - rect.left + el.scrollLeft

      // The inverse walk. Clicking a ghost seeks to where it starts — there is
      // nothing inside it to land on.
      let frames = 0
      let acc = 0
      for (const item of spine) {
        const w = item.seconds * pxPerSecond
        if (x < acc + w) {
          if (!item.clip) return playerRef.current?.seekToFrame(frames)
          const clipFrames = item.clip.outFrame - item.clip.inFrame
          const frame = frames + Math.round(((x - acc) / w) * clipFrames)
          return playerRef.current?.seekToFrame(
            Math.max(0, Math.min(frame, totalFrames - 1))
          )
        }
        if (item.clip) frames += item.clip.outFrame - item.clip.inFrame
        acc += w
      }
      playerRef.current?.seekToFrame(Math.max(0, totalFrames - 1))
    },
    [spine, pxPerSecond, totalFrames, playerRef]
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

  // Nothing to draw only when there is no sequence at all. A project whose
  // slots are still generating has a spine made entirely of ghosts, and that is
  // exactly when seeing the shape of the video matters most.
  if (spine.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTimecode(playhead)} <span className="text-muted-foreground/50">/</span>{" "}
          {/* The estimate, including ghosts. Showing only what has rendered
              would make the runtime climb as jobs land. */}
          {formatTimecode(Math.round(totalSeconds * FPS))}
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

          {/* The spine. Magnetic: blocks sit flush and a gap is unrepresentable,
              because a hole in a listing video is always a bug. */}
          <div className="flex items-center gap-0.5 p-2">
            {spine.map((item) =>
              item.clip ? (
                <TimelineClipBlock
                  key={item.key}
                  clip={item.clip}
                  index={item.index}
                  isActive={
                    Boolean(item.clip.slotId) && item.clip.slotId === selectedSlotId
                  }
                  pxPerSecond={pxPerSecond}
                  onSelect={() => {
                    select(item.clip!.slotId ?? null)
                    // Seek to where this block starts in composition time,
                    // which skips ghosts — they contribute no frames.
                    const startFrame = clips
                      .slice(0, item.index)
                      .reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0)
                    playerRef.current?.seekToFrame(startFrame)
                  }}
                  onTrim={(inF, outF) => setTrim(item.clip!.id, inF, outF)}
                  onReorder={handleReorder}
                  // The slot, not the take — regenerating asks for another result
                  // for the same clip, not a copy of an existing one. A still
                  // has nothing to regenerate.
                  onRegen={
                    onRegen && item.clip.slotId && item.clip.kind !== "still"
                      ? () => onRegen(item.clip!.slotId!)
                      : undefined
                  }
                />
              ) : (
                <GhostBlock
                  key={item.key}
                  name={item.slot!.name}
                  state={item.slot!.state}
                  kind={item.slot!.kind}
                  seconds={item.seconds}
                  pxPerSecond={pxPerSecond}
                  selected={item.slot!.id === selectedSlotId}
                  onSelect={() => select(item.slot!.id)}
                />
              )
            )}
          </div>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary"
            style={{ left: playheadX }}
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

/**
 * Tenths of a second, not frames.
 *
 * This used to print m:ss.FF, so 30.75s rendered as "0:30.23" — which reads as
 * thirty-point-two-three to anyone who does not already know it means twenty
 * three frames, and the agent using this has never opened an editor. It also
 * made the timeline appear to disagree with the runtime shown everywhere else.
 */
function formatTimecode(frames: number) {
  const totalSec = frames / FPS
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toFixed(1).padStart(4, "0")}`
}

function formatTick(t: number) {
  if (t < 60) return `${t % 1 === 0 ? t : t.toFixed(1)}s`
  const m = Math.floor(t / 60)
  const s = Math.round(t % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

const GHOST_LABEL: Record<SlotState, string> = {
  draft: "Not generated",
  queued: "Queued",
  running: "Generating",
  ready: "Ready",
  failed: "Failed",
}

/**
 * A slot with no media yet, holding its place on the spine.
 *
 * Dashed and unfilled so it never reads as footage, sized by the length the
 * slot is set to. Selectable, because it is still the shot the agent wants to
 * work on — but not trimmable, since there is nothing to trim against. Offering
 * a handle here would promise media that does not exist.
 *
 * A still only lands here before it has a photo. Once it does it renders as a
 * real block, because at that point it genuinely is the finished shot — there
 * is nothing else coming.
 */
function GhostBlock({
  name,
  state,
  kind,
  seconds,
  pxPerSecond,
  selected,
  onSelect,
}: {
  name: string
  state: SlotState
  kind: SlotKind
  seconds: number
  pxPerSecond: number
  selected: boolean
  onSelect: () => void
}) {
  // "Not generated" is meaningless on a still — nothing was ever going to
  // generate it. What it is missing is a photograph.
  const label =
    kind === "still" && state === "draft" ? "Needs a photo" : GHOST_LABEL[state]

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${name}, ${label}`}
      style={{ width: Math.max(seconds * pxPerSecond, 28) }}
      className={cn(
        "group relative h-20 shrink-0 overflow-hidden rounded-md border border-dashed text-left transition-colors",
        state === "failed"
          ? "border-destructive/60 bg-destructive/5"
          : selected
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/40 hover:border-foreground/30",
        state === "running" && "animate-pulse"
      )}
    >
      <span className="flex h-full flex-col justify-between p-1.5">
        <span className="truncate text-[11px] leading-tight text-muted-foreground">
          {name}
        </span>
        <span
          className={cn(
            "truncate font-mono text-[9.5px] leading-tight tabular-nums",
            state === "failed" ? "text-destructive" : "text-muted-foreground/70"
          )}
        >
          {label}
        </span>
      </span>
    </button>
  )
}
