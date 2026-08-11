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
import { Inspector } from "@/components/editor/Inspector"
import { FPS } from "@/lib/remotion/constants"
import type { SlotKind, SlotState, SlotTake, SlotWithTakes } from "@/lib/types/database"
import type { EditorPhoto } from "@/lib/hooks/usePhotos"
import { deriveSlotState } from "@/lib/editor/slotState"
import { useEditorShortcuts } from "@/lib/hooks/useEditorShortcuts"

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

/** Inline SVG photos so the picker works offline, like everything else here. */
const MOCK_PHOTOS: EditorPhoto[] = [
  "Kitchen",
  "Bedroom",
  "Garden",
  "Bathroom",
  "Hall",
  "Study",
].map((name, i) => ({
  id: `mock-photo-${i}`,
  file_name: `${name}.jpg`,
  s3_key: `photos/mock/${i}.jpg`,
  s3_url: swatch(name, 20 + i * 47),
  source: "upload" as const,
  created_at: new Date().toISOString(),
}))

/** A rail card without a database. Only the fields the rail actually reads. */
/** Takes for a slot, newest first, optionally generated with stale settings. */
function mockTakes(slotId: string, count: number, staleParams = false): SlotTake[] {
  return Array.from({ length: count }, (_, n) => ({
    id: `${slotId}-take-${n}`,
    slot_id: slotId,
    status: "succeeded" as const,
    mux_playback_id: null,
    is_current: n === 0,
    // Deliberately different from the slot's current values so the dirty
    // notice has something real to name.
    params: staleParams
      ? {
          start_photo_id: `mock-photo-0`,
          end_photo_id: null,
          camera_motion: "pull_out",
          motion_aggression: 20,
          duration_seconds: 6,
        }
      : null,
    created_at: new Date(Date.now() - n * 6e5).toISOString(),
    error_message: null,
  }))
}

function mockSlot(
  i: number,
  opts: {
    state: SlotState
    name?: string
    seconds?: number
    kind?: SlotKind
    takes?: number
    stale?: boolean
  }
): SlotWithTakes {
  const kind = opts.kind ?? "generated"
  const takes = mockTakes(`mock-slot-${i}`, opts.takes ?? 0, opts.stale)
  return {
    id: `mock-slot-${i}`,
    project_id: "mock-project",
    name: opts.name ?? `Clip ${i + 1}`,
    kind,
    position: i,
    start_photo_id: opts.state === "draft" ? null : `mock-photo-${i}`,
    // Every other generated slot travels between two frames, so the card's
    // one-vs-two thumbnail treatment is visible without clicking anything.
    end_photo_id: kind === "generated" && i % 2 === 1 ? `mock-photo-${(i + 2) % 6}` : null,
    camera_motion: "push_in",
    motion_aggression: 50,
    duration_seconds: 4,
    hold_duration_seconds: opts.seconds ?? 3,
    still_motion: "zoom_in",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    takes,
    // No playback id, so cards and take thumbs fall back to their icon rather
    // than reaching for a Mux thumbnail that does not exist. Stays offline.
    activeTake: takes.find((t) => t.is_current) ?? null,
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
      // Clip 1 has three takes and was generated with settings that have since
      // changed — the two states this panel most needs to get right.
      mockSlot(0, { state: "ready", seconds: DURATIONS[0], takes: 3, stale: true }),
      ...DURATIONS.slice(1).map((sec, i) =>
        mockSlot(i + 1, { state: "ready", seconds: sec, takes: i === 0 ? 2 : 1 })
      ),
      mockSlot(DURATIONS.length, { state: "running", name: "Back garden" }),
      mockSlot(DURATIONS.length + 1, { state: "draft", name: "Hallway" }),
      mockSlot(DURATIONS.length + 2, { state: "failed", name: "Loft" }),
      mockSlot(DURATIONS.length + 3, { state: "ready", name: "Front elevation", kind: "still" }),
    ])
  }, [setSlots])

  useEffect(() => {
    setAspectRatio(vertical ? "9:16" : "16:9")
  }, [vertical, setAspectRatio])

  useEditorShortcuts({ playerRef })

  return (
    // Fixed viewport height with the scroll inside each column: the rail has to
    // stay put while the stage scrolls, or it slides away exactly when you want
    // to click the next card.
    // Dark, like the real shell — the harness is worthless if it renders the
    // components in an environment they never actually live in.
    <div className="dark flex h-screen items-stretch overflow-hidden bg-background text-foreground">
      {/* The rail shares the one selection with the timeline below: clicking a
          card highlights the matching clip, and clicking a clip highlights the
          card. If those ever disagree, the store grew a second selection. */}
      <SequenceRail
        onAddSlot={() => console.log("add slot requested")}
        readyCount={5}
        photos={MOCK_PHOTOS}
      />

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

      {/* The workbench inverts to light inside the dark shell. */}
      <div className="light rounded-lg bg-background p-2 text-foreground">
        <TimelineTrack
          playerRef={playerRef}
          onRegen={(id) => console.log("regen requested for", id)}
        />
      </div>

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

      {/* Third surface on the same selection. Edits go to the store rather than
          the network so the harness stays offline — the real page hands
          patchSlot in here instead. */}
      <div className="w-[340px] shrink-0">
      <Inspector
        uploads={MOCK_PHOTOS}
        extractedFrames={[]}
        onPatch={async (slotId, patch) => {
          const s = useEditorStore.getState().slots.find((x) => x.id === slotId)
          if (!s) return
          const next = { ...s }
          if ("name" in patch) next.name = patch.name as string
          if ("kind" in patch) next.kind = patch.kind as typeof s.kind
          if ("startPhotoId" in patch) next.start_photo_id = patch.startPhotoId as string | null
          if ("endPhotoId" in patch) next.end_photo_id = patch.endPhotoId as string | null
          if ("cameraMotion" in patch) next.camera_motion = patch.cameraMotion as typeof s.camera_motion
          if ("motionAggression" in patch) next.motion_aggression = patch.motionAggression as number
          if ("durationSeconds" in patch) next.duration_seconds = patch.durationSeconds as typeof s.duration_seconds
          if ("holdDurationSeconds" in patch) next.hold_duration_seconds = patch.holdDurationSeconds as number
          if ("stillMotion" in patch) next.still_motion = patch.stillMotion as typeof s.still_motion
          next.state = deriveSlotState(next, next.activeTake)
          useEditorStore.getState().upsertSlot(next)
        }}
        onGenerate={(slotId) => console.log("generate requested for", slotId)}
        onSelectTake={async (slotId, takeId) => {
          const s = useEditorStore.getState().slots.find((x) => x.id === slotId)
          if (!s) return
          const takes = s.takes.map((t) => ({ ...t, is_current: t.id === takeId }))
          useEditorStore.getState().upsertSlot({
            ...s,
            takes,
            activeTake: takes.find((t) => t.is_current) ?? null,
          })
        }}
        costTokens={400}
      />
      </div>
    </div>
  )
}
