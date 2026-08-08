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
import { FPS } from "@/lib/remotion/constants"

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
  const [vertical, setVertical] = useState(false)

  useEffect(() => {
    setClips(
      DURATIONS.map((sec, i) => ({
        id: `mock-${i}`,
        src: SAMPLE_SRC[i % SAMPLE_SRC.length],
        orderIndex: i,
        thumbnail: swatch(`${i + 1}`, 190 + i * 38),
        durationInFrames: Math.round(SOURCE_SECONDS * FPS),
        inFrame: 0,
        outFrame: Math.round(sec * FPS),
      }))
    )
  }, [setClips])

  useEffect(() => {
    setAspectRatio(vertical ? "9:16" : "16:9")
  }, [vertical, setAspectRatio])

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Timeline preview</h1>
          <p className="text-sm text-muted-foreground">
            Mock clips. Dev-only route — not reachable in production.
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
            clips.map((c) => ({
              i: c.orderIndex,
              in: c.inFrame,
              out: c.outFrame,
              sec: +((c.outFrame - c.inFrame) / FPS).toFixed(2),
            })),
            null,
            2
          )}
        </pre>
      </details>
    </div>
  )
}
