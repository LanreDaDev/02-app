'use client'

import { useMemo } from 'react'
import { useTimelineStore } from '@/lib/stores/useTimelineStore'
import { useEditorStore, type PlaybackScope } from '@/lib/stores/useEditorStore'
import { frameRangeForSlot } from '@/lib/editor/runtime'

/**
 * What the player is currently playing, in composition frames.
 *
 * One derivation shared by the player, the transport and the timeline. Three
 * surfaces each working out the range for themselves is how the transport ends
 * up counting down the whole video while the player loops four seconds of it.
 */
export interface PlaybackRange {
  scope: PlaybackScope
  /** First frame played, and one past the last — half-open, like the clips. */
  from: number
  to: number
  /** The whole composition, whatever the scope. */
  total: number
  /** True when playback is genuinely confined to one clip. */
  scoped: boolean
  /**
   * Scope is 'clip' but the selected slot has nothing on screen — a draft, or a
   * take still encoding. There is no range to play, and pretending otherwise
   * means the play button silently plays the whole video instead.
   */
  blocked: boolean
}

export function usePlaybackRange(): PlaybackRange {
  const clips = useTimelineStore((s) => s.clips)
  const scope = useEditorStore((s) => s.playbackScope)
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)

  return useMemo(() => {
    const total = clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0)
    const whole = { scope, from: 0, to: total, total, scoped: false }

    if (scope === 'video') return { ...whole, blocked: false }

    const range = frameRangeForSlot(clips, selectedSlotId)
    if (!range) return { ...whole, blocked: true }

    return { scope, ...range, total, scoped: true, blocked: false }
  }, [clips, scope, selectedSlotId])
}
