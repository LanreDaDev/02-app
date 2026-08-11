"use client"

import { useRef } from "react"
import { RotateCcw, GripVertical, Image as ImageIcon } from "lucide-react"
import { FPS } from "@/lib/remotion/constants"
import { cn } from "@/lib/utils"
import type { TimelineClipProps } from "@/lib/remotion/types"

/** Minimum a clip can be trimmed to, so it can't be dragged out of existence. */
const MIN_FRAMES = Math.round(FPS * 0.5)

interface TimelineClipBlockProps {
  clip: TimelineClipProps
  index: number
  isActive: boolean
  /** Playback is scoped to another clip, so this one is not in play. */
  outsideRange?: boolean
  pxPerSecond: number
  onSelect: () => void
  onTrim: (inFrame: number, outFrame: number) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onRegen?: () => void
}

export function TimelineClipBlock({
  clip,
  index,
  isActive,
  outsideRange,
  pxPerSecond,
  onSelect,
  onTrim,
  onReorder,
  onRegen,
}: TimelineClipBlockProps) {
  const elRef = useRef<HTMLDivElement>(null)

  const visibleFrames = clip.outFrame - clip.inFrame
  const width = (visibleFrames / FPS) * pxPerSecond

  /**
   * A still has no source to trim against and nothing to regenerate.
   *
   * Its length is the hold, which lives on the slot and is set in the inspector.
   * Offering a trim handle here would let the timeline and the inspector print
   * different numbers for the same shot, and there is no footage either side of
   * the edge to justify the gesture in the first place.
   */
  const isStill = clip.kind === "still"
  const isTrimmed = !isStill && (clip.inFrame > 0 || clip.outFrame < clip.durationInFrames)

  /**
   * Drag a clip edge to trim.
   *
   * Pointer capture keeps the gesture alive when the cursor leaves the handle,
   * which matters because trim handles are only 8px wide.
   */
  function startTrim(edge: "in" | "out", e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startIn = clip.inFrame
    const startOut = clip.outFrame
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      const deltaFrames = Math.round(((ev.clientX - startX) / pxPerSecond) * FPS)

      if (edge === "in") {
        const next = Math.min(
          Math.max(0, startIn + deltaFrames),
          startOut - MIN_FRAMES
        )
        onTrim(next, startOut)
      } else {
        const next = Math.max(
          Math.min(clip.durationInFrames, startOut + deltaFrames),
          startIn + MIN_FRAMES
        )
        onTrim(startIn, next)
      }
    }

    const up = () => {
      target.releasePointerCapture(e.pointerId)
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  /**
   * Drag the clip body to reorder. Swaps position once the pointer has travelled
   * more than half a clip width, so reordering feels like sliding rather than
   * requiring a precise drop target.
   */
  function startReorder(e: React.PointerEvent) {
    if (e.button !== 0) return
    onSelect()

    const startX = e.clientX
    let moved = false
    let currentIndex = index

    const move = (ev: PointerEvent) => {
      const delta = ev.clientX - startX
      if (!moved && Math.abs(delta) < 6) return
      moved = true

      const shift = Math.round(delta / Math.max(width, 1))
      const target = currentIndex + shift
      if (shift !== 0 && target !== currentIndex) {
        onReorder(currentIndex, target)
        currentIndex = target
      }
    }

    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={0}
      aria-label={`${isStill ? "Still" : "Clip"} ${index + 1}, ${(
        visibleFrames / FPS
      ).toFixed(1)} seconds`}
      aria-pressed={isActive}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      onPointerDown={startReorder}
      className={cn(
        "group relative h-20 shrink-0 cursor-grab overflow-hidden rounded-md border bg-muted transition-colors active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        isActive
          ? "border-primary ring-2 ring-primary/25"
          : "border-border hover:border-muted-foreground/40",
        // Still fully clickable — dimming says what is playing, not what is
        // reachable. Clicking one of these is how you switch to it.
        outsideRange && "opacity-40 hover:opacity-70"
      )}
      style={{ width: Math.max(width, 28) }}
    >
      {clip.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clip.thumbnail}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/15" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white tabular-nums">
        {index + 1}
        {/* Says why this block has no handles, without a tooltip to hunt for. */}
        {isStill && <ImageIcon className="size-2.5" aria-hidden />}
      </span>

      {isTrimmed && (
        <span
          title="Trimmed"
          className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary ring-2 ring-black/40"
        />
      )}

      {width > 54 && (
        <span className="absolute bottom-1.5 left-1.5 font-mono text-[10px] leading-none text-white/90 tabular-nums">
          {(visibleFrames / FPS).toFixed(1)}s
        </span>
      )}

      {onRegen && !isStill && isActive && width > 70 && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRegen()
          }}
          title="Redo this clip · 400 tokens"
          aria-label="Redo this clip for 400 tokens"
          className="absolute bottom-1 right-1 grid size-6 place-items-center rounded bg-black/70 text-white transition-colors hover:bg-black/90"
        >
          <RotateCcw className="size-3" />
        </button>
      )}

      {/* Trim handles. Always present for pointer/keyboard, visible on hover or
          when the clip is selected. Never on a still — see isStill above. */}
      {!isStill && (
        <>
          <TrimHandle side="left" visible={isActive} onPointerDown={(e) => startTrim("in", e)} />
          <TrimHandle side="right" visible={isActive} onPointerDown={(e) => startTrim("out", e)} />
        </>
      )}
    </div>
  )
}

function TrimHandle({
  side,
  visible,
  onPointerDown,
}: {
  side: "left" | "right"
  visible: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-label={side === "left" ? "Trim clip start" : "Trim clip end"}
      className={cn(
        "absolute inset-y-0 z-10 flex w-2 cursor-ew-resize items-center justify-center bg-primary/90 transition-opacity",
        side === "left" ? "left-0 rounded-l-md" : "right-0 rounded-r-md",
        visible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}
    >
      <GripVertical className="pointer-events-none size-2.5 text-primary-foreground" />
    </div>
  )
}
