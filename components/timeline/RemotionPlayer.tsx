"use client"

import { Player, type PlayerRef } from "@remotion/player"
import { useMemo, useRef, useImperativeHandle, forwardRef, useCallback } from "react"
import { TimelineComposition } from "@/lib/remotion/TimelineComposition"
import { useTimelineStore } from "@/lib/stores/useTimelineStore"
import { FPS, getResolution } from "@/lib/remotion/constants"
import { cn } from "@/lib/utils"

export interface RemotionPlayerHandle {
  seekToFrame: (frame: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  getCurrentFrame: () => number
  isPlaying: () => boolean
  /** Subscribe to playback position. Returns an unsubscribe function. */
  onFrame: (cb: (frame: number) => void) => () => void
  /** Subscribe to play/pause transitions. Returns an unsubscribe function. */
  onPlayStateChange: (cb: (playing: boolean) => void) => () => void
}

export const RemotionPlayer = forwardRef<RemotionPlayerHandle, { isVertical: boolean }>(
  function RemotionPlayer({ isVertical }, ref) {
    const playerRef = useRef<PlayerRef>(null)
    const clips = useTimelineStore((s) => s.clips)
    const aspectRatio = useTimelineStore((s) => s.aspectRatio)

    const totalFrames = useMemo(
      () => clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0),
      [clips]
    )

    const compositionProps = useMemo(() => {
      const resolution = getResolution(aspectRatio)
      return { clips, fps: FPS, width: resolution.width, height: resolution.height }
    }, [clips, aspectRatio])

    // The timeline playhead is driven by these events rather than polling, so it
    // stays exactly in step with the player instead of drifting a frame behind.
    const onFrame = useCallback((cb: (frame: number) => void) => {
      const player = playerRef.current
      if (!player) return () => {}

      const handler = (e: { detail: { frame: number } }) => cb(e.detail.frame)
      player.addEventListener("frameupdate", handler)
      return () => player.removeEventListener("frameupdate", handler)
    }, [])

    const onPlayStateChange = useCallback((cb: (playing: boolean) => void) => {
      const player = playerRef.current
      if (!player) return () => {}

      const onPlay = () => cb(true)
      const onPause = () => cb(false)
      player.addEventListener("play", onPlay)
      player.addEventListener("pause", onPause)
      return () => {
        player.removeEventListener("play", onPlay)
        player.removeEventListener("pause", onPause)
      }
    }, [])

    useImperativeHandle(ref, () => ({
      seekToFrame: (frame: number) => playerRef.current?.seekTo(frame),
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
      toggle: () => playerRef.current?.toggle(),
      getCurrentFrame: () => playerRef.current?.getCurrentFrame() ?? 0,
      isPlaying: () => playerRef.current?.isPlaying() ?? false,
      onFrame,
      onPlayStateChange,
    }))

    if (totalFrames === 0) return null

    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-black",
          isVertical ? "mx-auto aspect-[9/16] w-full max-w-[320px]" : "aspect-video w-full"
        )}
      >
        <Player
          ref={playerRef}
          component={TimelineComposition as never}
          inputProps={compositionProps}
          durationInFrames={Math.max(1, totalFrames)}
          compositionWidth={compositionProps.width}
          compositionHeight={compositionProps.height}
          fps={FPS}
          style={{ width: "100%", height: "100%" }}
          acknowledgeRemotionLicense
          autoPlay={false}
          loop={false}
          errorFallback={({ error }) => (
            <div className="flex h-full items-center justify-center p-5 text-sm text-destructive">
              Player error: {error.message}
            </div>
          )}
        />
      </div>
    )
  }
)
