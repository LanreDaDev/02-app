"use client"

import { useEffect, useState } from "react"
import { Play, Pause, SkipBack, SkipForward } from "lucide-react"
import { useTimelineStore } from "@/lib/stores/useTimelineStore"
import { useEditorStore, type PlaybackScope } from "@/lib/stores/useEditorStore"
import { usePlaybackRange } from "@/lib/hooks/usePlaybackRange"
import { FPS } from "@/lib/remotion/constants"
import { cn } from "@/lib/utils"
import type { RemotionPlayerHandle } from "./RemotionPlayer"

interface TimelineControlsProps {
  playerRef: React.RefObject<RemotionPlayerHandle | null>
}

export function TimelineControls({ playerRef }: TimelineControlsProps) {
  const clips = useTimelineStore((s) => s.clips)
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)
  const selectedSlot = useEditorStore((s) =>
    s.slots.find((slot) => slot.id === s.selectedSlotId)
  )
  const scope = useEditorStore((s) => s.playbackScope)
  const setScope = useEditorStore((s) => s.setPlaybackScope)

  const { from, to, total, scoped, blocked } = usePlaybackRange()
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    return player.onPlayStateChange(setPlaying)
  }, [playerRef, clips.length])

  // Space is bound once, in useEditorShortcuts. It used to be bound here as
  // well, and because both listeners called toggle() on the same player every
  // press fired twice and cancelled itself out — the space bar did nothing.

  if (clips.length === 0) return null

  const shownSeconds = ((to - from) / FPS).toFixed(1)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => playerRef.current?.seekToFrame(from)}
        disabled={blocked}
        aria-label={scoped ? "Jump to start of clip" : "Jump to start"}
        className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <SkipBack className="size-3.5" />
      </button>

      <button
        onClick={() => playerRef.current?.toggle()}
        disabled={blocked}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>

      <button
        onClick={() => playerRef.current?.seekToFrame(Math.max(from, to - 1))}
        disabled={blocked}
        aria-label={scoped ? "Jump to end of clip" : "Jump to end"}
        className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <SkipForward className="size-3.5" />
      </button>

      <ScopeToggle
        scope={scope}
        onChange={setScope}
        // Nothing selected means the project, and the project is the whole
        // video. Offering "This clip" with no clip in question would be a
        // button whose only outcome is an error message.
        clipAvailable={Boolean(selectedSlotId)}
      />

      <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground">
        {/* The figure has to follow the scope. A transport that counts the whole
            video while the player loops four seconds of it is the same lie as
            two surfaces disagreeing about the runtime. */}
        {blocked ? (
          `—— · ${(total / FPS).toFixed(1)}s total`
        ) : scoped ? (
          <>
            {shownSeconds}s · this clip
          </>
        ) : (
          `${shownSeconds}s · ${clips.length} clip${clips.length !== 1 ? "s" : ""}`
        )}
      </span>

      {blocked && (
        <span className="text-[11.5px] text-muted-foreground">
          {selectedSlot ? `${selectedSlot.name} has nothing to play yet.` : "Nothing to play yet."}
        </span>
      )}
    </div>
  )
}

/**
 * What the player plays: the shot, or the film.
 *
 * Two named states rather than a loop checkbox, because the agent is not
 * choosing a playback setting — they are choosing which question they are
 * asking. "Is this shot right" and "does this video work" are answered by
 * watching different things.
 */
function ScopeToggle({
  scope,
  onChange,
  clipAvailable,
}: {
  scope: PlaybackScope
  onChange: (scope: PlaybackScope) => void
  clipAvailable: boolean
}) {
  const options: { value: PlaybackScope; label: string }[] = [
    { value: "clip", label: "This clip" },
    { value: "video", label: "Full video" },
  ]

  return (
    <div
      role="group"
      aria-label="What plays"
      className="ml-1 flex overflow-hidden rounded-md border border-border"
    >
      {options.map(({ value, label }) => {
        const disabled = value === "clip" && !clipAvailable
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            disabled={disabled}
            aria-pressed={scope === value}
            title={disabled ? "Select a clip first" : undefined}
            className={cn(
              "px-2.5 py-1 text-[11.5px] transition-colors",
              scope === value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60",
              disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
