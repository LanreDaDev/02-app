'use client'

import { useEffect } from 'react'
import { useEditorStore } from '@/lib/stores/useEditorStore'
import { useTimelineStore } from '@/lib/stores/useTimelineStore'
import { frameRangeForSlot } from '@/lib/editor/runtime'
import type { RemotionPlayerHandle } from '@/components/timeline/RemotionPlayer'

/**
 * The review loop, on the keyboard.
 *
 * Down-arrow walks the sequence: each press selects the next slot, which moves
 * the rail, the inspector and the player together. Hold it, stop when something
 * looks wrong, fix it, carry on. Reaching for the mouse between every clip is
 * what makes reviewing twenty shots feel like work.
 *
 * Nothing here fires while the agent is typing. A rename that swallowed the
 * arrow keys, or a space bar that started playback mid-word, would make the
 * text fields unusable — and those are the same keys.
 */

interface Options {
  playerRef: React.RefObject<RemotionPlayerHandle | null>
  onGenerate?: (slotId: string) => void | Promise<void>
  /** Off while a modal owns the keyboard, or before the project has loaded. */
  enabled?: boolean
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

/**
 * The same range the transport and the player use, read at keypress time.
 *
 * Read rather than subscribed to: this listener is bound once, and closing over
 * a range would leave the space bar acting on whatever was selected when the
 * effect last ran.
 */
function currentRange(): { from: number; to: number; blocked: boolean } {
  const { playbackScope, selectedSlotId } = useEditorStore.getState()
  const { clips } = useTimelineStore.getState()
  const total = clips.reduce((acc, c) => acc + (c.outFrame - c.inFrame), 0)

  if (playbackScope === 'video') return { from: 0, to: total, blocked: false }

  const range = frameRangeForSlot(clips, selectedSlotId)
  if (!range) return { from: 0, to: total, blocked: true }
  return { ...range, blocked: false }
}

export function useEditorShortcuts({ playerRef, onGenerate, enabled = true }: Options) {
  useEffect(() => {
    if (!enabled) return

    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target)) return

      const { slots, selectedSlotId, select } = useEditorStore.getState()
      const index = slots.findIndex((s) => s.id === selectedSlotId)

      // Step to a neighbour. With nothing selected, down enters at the top and
      // up enters at the bottom, so either key gets you into the sequence.
      const step = (delta: number) => {
        if (slots.length === 0) return
        if (index === -1) {
          select(delta > 0 ? slots[0].id : slots[slots.length - 1].id)
          return
        }
        const next = index + delta
        // Deliberately clamped rather than wrapping: holding down-arrow should
        // come to rest at the end, not loop silently back to the start.
        if (next < 0 || next >= slots.length) return
        select(slots[next].id)
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          step(1)
          break

        case 'ArrowUp':
          e.preventDefault()
          step(-1)
          break

        case 'Escape':
          select(null)
          break

        case ' ': {
          e.preventDefault()
          // Playing "this clip" when this clip has no media would quietly play
          // the whole video instead — the one thing the mode promises not to do.
          if (currentRange().blocked) break
          playerRef.current?.toggle()
          break
        }

        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault()
          const { from, to, blocked } = currentRange()
          if (blocked) break
          const delta = e.key === 'ArrowLeft' ? -1 : 1
          const frame = (playerRef.current?.getCurrentFrame() ?? 0) + delta
          // Stepping stays inside whatever is being played, so a frame-by-frame
          // look at one shot cannot wander into the next one.
          playerRef.current?.seekToFrame(Math.min(Math.max(frame, from), Math.max(from, to - 1)))
          break
        }

        case 'Enter':
          // ⌘↵ generates the selected slot; plain Enter is rename, which the
          // inspector's name field owns.
          if ((e.metaKey || e.ctrlKey) && selectedSlotId && onGenerate) {
            e.preventDefault()
            void onGenerate(selectedSlotId)
          }
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playerRef, onGenerate, enabled])
}
