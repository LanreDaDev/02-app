"use client"

/**
 * Timeline editor preview — DEV ONLY.
 *
 * Renders the real timeline components against mock clips so the editor can be
 * worked on without running a generation (which costs real Veo credits) or
 * waiting on Mux encoding. Returns 404 in production.
 */

import { useEffect, useRef, useState } from "react"
import { notFound } from "next/navigation"
import { RemotionPlayer, type RemotionPlayerHandle } from "@/components/timeline/RemotionPlayer"
import { TimelineTrack } from "@/components/timeline/TimelineTrack"
import { TimelineControls } from "@/components/timeline/TimelineControls"
import { useTimelineStore } from "@/lib/stores/useTimelineStore"
import { useEditorStore } from "@/lib/stores/useEditorStore"
import { SequenceRail } from "@/components/editor/SequenceRail"
import { FPS } from "@/lib/remotion/constants"
import type { SlotKind, SlotState, SlotWithTakes } from "@/lib/types/database"

/** Inline SVG so nothing depends on the network or a live Mux asset. */
function swatch(label: string, hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},45%,42%)"/>
      <stop offset="100%" stop-color="hsl(${hue + 25},40%,22%)"/>
    </linearGradient></defs>
    <rect width="320" height="180" fill="url(#g)"/>
    <text x="160" y="98" font-family="sans-serif" font-size="26" fill="rgba(255,255,255,.85)"
      text-anchor="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// Locally generated fixtures (public/dev-samples) rather than remote samples, so
// the preview works offline and can't break when a third-party URL disappears.
// Each is 8s of test pattern with a visible frame counter — scrubbing and
// trimming show real movement.
const SAMPLE_SRC = [
  "/dev-samples/clip0.mp4",
  "/dev-samples/clip1.mp4",
  "/dev-samples/clip2.mp4",
  "/dev-samples/clip3.mp4",
]

const SOURCE_SECONDS = 8

/** A rail card without a database. Only the fields the rail actually reads. */
function mockSlot(
  i: number,
  opts: { state: SlotState; name?: string; seconds?: number; kind?: SlotKind }
): SlotWithTakes {
  const kind = opts.kind ?? "generated"
  return {
    id: `mock-slot-${i}`,
    project_id: "mock-project",
    name: opts.name ?? `Clip ${i + 1}`,
    kind,
    position: i,
    start_photo_id: opts.state === "draft" ? null : `mock-photo-${i}`,
    end_photo_id: null,
    camera_motion: "push_in",
    motion_aggression: 50,
    duration_seconds: 4,
    hold_duration_seconds: opts.seconds ?? 3,
    still_motion: "zoom_in",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    takes: [],
    // No playback id, so cards fall back to their icon rather than reaching for
    // a Mux thumbnail that does not exist. The harness stays offline.
    activeTake: null,
    state: opts.state,
  }
}

// Deliberately uneven visible durations — proportional widths are the whole point
// of a timeline, and equal-length clips would hide whether that works. Each sits
// inside a longer source so there's real headroom to trim out to.
const DURATIONS = [4, 2.5, 6, 3.25]

export default function TimelinePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound()

  const playerRef = useRef<RemotionPlayerHandle>(null)
  const setClips = useTimelineStore((s) => s.setClips)
  const setAspectRatio = useTimelineStore((s) => s.setAspectRatio)
  const clips = useTimelineStore((s) => s.clips)
  const setSlots = useEditorStore((s) => s.setSlots)
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)
  const [vertical, setVertical] = useState(false)

  useEffect(() => {
    setClips(
      DURATIONS.map((sec, i) => ({
        id: `mock-take-${i}`,
        // A clip is a TAKE and carries the slot it belongs to. Selection is the
        // slot's, so without this the timeline can't highlight or regenerate —
        // which is exactly what a harness for this should be exercising.
        slotId: `mock-slot-${i}`,
        src: SAMPLE_SRC[i % SAMPLE_SRC.length],
        orderIndex: i,
        thumbnail: swatch(`${i + 1}`, 190 + i * 38),
        durationInFrames: Math.round(SOURCE_SECONDS * FPS),
        inFrame: 0,
        outFrame: Math.round(sec * FPS),
      }))
    )
  }, [setClips])

  // Mock slots for the rail, one per take plus a still and a draft so the card
  // states are all visible without generating anything.
  useEffect(() => {
    setSlots([
      ...DURATIONS.map((sec, i) => mockSlot(i, { state: "ready", seconds: sec })),
      mockSlot(DURATIONS.length, { state: "running", name: "Back garden" }),
      mockSlot(DURATIONS.length + 1, { state: "draft", name: "Hallway" }),
      mockSlot(DURATIONS.length + 2, { state: "failed", name: "Loft" }),
      mockSlot(DURATIONS.length + 3, { state: "ready", name: "Front elevation", kind: "still" }),
    ])
  }, [setSlots])

  useEffect(() => {
    setAspectRatio(vertical ? "9:16" : "16:9")
  }, [vertical, setAspectRatio])

  return (
    // Fixed viewport height with the scroll inside each column: the rail has to
    // stay put while the stage scrolls, or it slides away exactly when you want
    // to click the next card.
    <div className="flex h-screen items-stretch overflow-hidden">
      {/* The rail shares the one selection with the timeline below: clicking a
          card highlights the matching clip, and clicking a clip highlights the
          card. If those ever disagree, the store grew a second selection. */}
      <SequenceRail onAddSlot={() => console.log("add slot requested")} />

      <div className="min-w-0 flex-1 space-y-5 overflow-y-auto p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Timeline preview</h1>
          <p className="text-sm text-muted-foreground">
            Mock clips and slots. Dev-only route — not reachable in production.
          </p>
        </div>

        <button
          onClick={() => setVertical((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          {vertical ? "9:16 vertical" : "16:9 horizontal"}
        </button>
      </header>

      <RemotionPlayer ref={playerRef} isVertical={vertical} />

      <TimelineControls playerRef={playerRef} />

      <TimelineTrack
        playerRef={playerRef}
        onRegen={(id) => console.log("regen requested for", id)}
      />

      <details className="rounded-lg border border-border bg-card p-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Composition state</summary>
        <pre className="mt-2 overflow-x-auto font-mono text-xs text-muted-foreground">
          {JSON.stringify(
            {
              selectedSlotId,
              clips: clips.map((c) => ({
                i: c.orderIndex,
                slot: c.slotId,
                in: c.inFrame,
                out: c.outFrame,
                sec: +((c.outFrame - c.inFrame) / FPS).toFixed(2),
              })),
            },
            null,
            2
          )}
        </pre>
      </details>
      </div>
    </div>
  )
}
