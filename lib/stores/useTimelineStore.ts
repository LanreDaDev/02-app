import { create } from 'zustand'
import { FPS, DEFAULT_CLIP_DURATION_FRAMES, getResolution } from '@/lib/remotion/constants'
import type { TimelineClipProps, CompositionProps } from '@/lib/remotion/types'

type AspectRatio = '16:9' | '9:16'

interface TimelineState {
  clips: TimelineClipProps[]
  aspectRatio: AspectRatio
  activeClipId: string | null

  setClips: (clips: TimelineClipProps[]) => void
  addClip: (clip: TimelineClipProps) => void
  removeClip: (id: string) => void
  replaceClip: (id: string, newClip: TimelineClipProps) => void
  reorderClips: (orderedIds: string[]) => void
  setTrim: (id: string, inFrame: number, outFrame: number) => void
  setActiveClip: (id: string | null) => void
  setAspectRatio: (ratio: AspectRatio) => void

  totalDurationInFrames: () => number
  getCompositionProps: () => CompositionProps
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  clips: [],
  aspectRatio: '16:9',
  activeClipId: null,

  setClips: (clips) => set({ clips }),

  // Insert by orderIndex, not arrival. A clip that generates faster than an
  // earlier one must still sit in its correct place on the timeline.
  addClip: (clip) =>
    set((s) => {
      if (s.clips.some((c) => c.id === clip.id)) return s
      const next = [...s.clips, clip]
      next.sort((a, b) => a.orderIndex - b.orderIndex)
      return { clips: next }
    }),

  removeClip: (id) =>
    set((s) => ({
      clips: s.clips.filter((c) => c.id !== id),
      activeClipId: s.activeClipId === id ? null : s.activeClipId,
    })),

  replaceClip: (id, newClip) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? newClip : c)),
    })),

  reorderClips: (orderedIds) =>
    set((s) => {
      const map = new Map(s.clips.map((c) => [c.id, c]))
      return { clips: orderedIds.map((id) => map.get(id)!).filter(Boolean) }
    }),

  setTrim: (id, inFrame, outFrame) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, inFrame, outFrame } : c)),
    })),

  setActiveClip: (id) => set({ activeClipId: id }),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),

  totalDurationInFrames: () =>
    get().clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0),

  getCompositionProps: () => {
    const { clips, aspectRatio } = get()
    const resolution = getResolution(aspectRatio)
    return {
      clips,
      fps: FPS,
      width: resolution.width,
      height: resolution.height,
    }
  },
}))

export function clipFromServer(clip: {
  id: string
  src: string
  orderIndex: number
  durationSec?: number | null
  thumbnail?: string | null
}): TimelineClipProps {
  const frames = clip.durationSec
    ? Math.round(clip.durationSec * FPS)
    : DEFAULT_CLIP_DURATION_FRAMES

  return {
    id: clip.id,
    src: clip.src,
    orderIndex: clip.orderIndex,
    thumbnail: clip.thumbnail ?? null,
    durationInFrames: frames,
    inFrame: 0,
    outFrame: frames,
  }
}
