import { create } from 'zustand'
import { FPS, DEFAULT_CLIP_DURATION_FRAMES, getResolution } from '@/lib/remotion/constants'
import type { TimelineClipProps, CompositionProps } from '@/lib/remotion/types'

type AspectRatio = '16:9' | '9:16'

/**
 * The composition: what Remotion renders, in timeline order.
 *
 * Deliberately holds no selection. Selection is a slot, it lives in
 * useEditorStore, and a clip here highlights only by matching its `slotId`
 * against it — see the note there for the bug that a second selection caused.
 */
interface TimelineState {
  clips: TimelineClipProps[]
  aspectRatio: AspectRatio

  setClips: (clips: TimelineClipProps[]) => void
  addClip: (clip: TimelineClipProps) => void
  removeClip: (id: string) => void
  replaceClip: (id: string, newClip: TimelineClipProps) => void
  reorderClips: (orderedIds: string[]) => void
  setTrim: (id: string, inFrame: number, outFrame: number) => void
  setAspectRatio: (ratio: AspectRatio) => void

  totalDurationInFrames: () => number
  getCompositionProps: () => CompositionProps
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  clips: [],
  aspectRatio: '16:9',

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
  slotId?: string
  durationSec?: number | null
  thumbnail?: string | null
  /** Absent means video — the only kind that existed before stills rendered. */
  kind?: TimelineClipProps['kind']
  stillMotion?: TimelineClipProps['stillMotion']
}): TimelineClipProps {
  const frames = clip.durationSec
    ? Math.round(clip.durationSec * FPS)
    : DEFAULT_CLIP_DURATION_FRAMES

  return {
    id: clip.id,
    kind: clip.kind ?? 'video',
    src: clip.src,
    orderIndex: clip.orderIndex,
    slotId: clip.slotId,
    thumbnail: clip.thumbnail ?? null,
    stillMotion: clip.stillMotion,
    durationInFrames: frames,
    inFrame: 0,
    outFrame: frames,
  }
}
