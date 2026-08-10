'use client'

import { useState } from 'react'
import { Film, Image as ImageIcon, Plus, AlertCircle } from 'lucide-react'
import { useEditorStore } from '@/lib/stores/useEditorStore'
import { cn } from '@/lib/utils'
import type { SlotState, SlotWithTakes } from '@/lib/types/database'

/**
 * The sequence rail: every slot in the project, in the order the agent built
 * them.
 *
 * This is where a clip comes into existence. Rail order is deliberately not
 * timeline order — moving a clip on the timeline must not disturb the grouping
 * built here, which is why slots carry their own position.
 *
 * Selection is read from the store and never held locally. A card is
 * highlighted because it is the selected slot, not because it was the last one
 * clicked.
 */

interface SequenceRailProps {
  onAddSlot: () => void | Promise<void>
  adding?: boolean
}

const STATE_LABEL: Record<SlotState, string> = {
  draft: 'Needs a photo',
  queued: 'Queued',
  running: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
}

/** Amber is the working colour; green only once there is something to watch. */
const STATE_DOT: Record<SlotState, string> = {
  draft: 'bg-muted-foreground/40',
  queued: 'bg-warning/60',
  running: 'bg-warning animate-pulse',
  ready: 'bg-success',
  failed: 'bg-destructive',
}

export function SequenceRail({ onAddSlot, adding }: SequenceRailProps) {
  const slots = useEditorStore((s) => s.slots)
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)
  const select = useEditorStore((s) => s.select)

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="font-serif text-sm text-foreground">Sequence</h2>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {slots.length} {slots.length === 1 ? 'clip' : 'clips'}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {slots.length === 0 ? (
          <EmptyRail />
        ) : (
          <ul className="flex flex-col gap-2">
            {slots.map((slot, i) => (
              <li key={slot.id}>
                <SlotCard
                  slot={slot}
                  index={i}
                  selected={slot.id === selectedSlotId}
                  onSelect={() => select(slot.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => void onAddSlot()}
          disabled={adding}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border',
            'px-3 py-2.5 text-sm text-muted-foreground transition-colors',
            'hover:border-foreground/30 hover:bg-muted hover:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Plus size={14} />
          {adding ? 'Adding…' : 'Add clip'}
        </button>
      </div>
    </aside>
  )
}

function EmptyRail() {
  return (
    <div className="mt-10 px-4 text-center">
      <Film size={20} className="mx-auto mb-3 text-muted-foreground/50" />
      <p className="text-sm text-foreground">No clips yet</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Add a clip, choose a photo for it, and generate. Build them one at a
        time — you can look at each before making the next.
      </p>
    </div>
  )
}

interface SlotCardProps {
  slot: SlotWithTakes
  index: number
  selected: boolean
  onSelect: () => void
}

function SlotCard({ slot, index, selected, onSelect }: SlotCardProps) {
  const [imgFailed, setImgFailed] = useState(false)

  const isStill = slot.kind === 'still'
  // A still is held for as long as narration needs; a generated clip is only
  // ever the lengths the model produces.
  const seconds = isStill ? slot.hold_duration_seconds : slot.duration_seconds

  const playbackId = slot.activeTake?.mux_playback_id
  const poster =
    playbackId && !imgFailed
      ? `https://image.mux.com/${playbackId}/thumbnail.webp?width=160&fit_mode=smartcrop`
      : null

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors',
        selected
          ? 'border-warning bg-warning/10'
          : 'border-border bg-background hover:border-foreground/20 hover:bg-muted'
      )}
    >
      <div className="relative grid h-12 w-[68px] shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : isStill ? (
          <ImageIcon size={14} className="text-muted-foreground" />
        ) : (
          <Film size={14} className="text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="truncate text-[13px] text-foreground">{slot.name}</span>
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATE_DOT[slot.state])} />
          <span className="truncate text-[11px] text-muted-foreground">
            {slot.state === 'failed' ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <AlertCircle size={10} />
                {STATE_LABEL.failed}
              </span>
            ) : (
              STATE_LABEL[slot.state]
            )}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {seconds}s
          </span>
        </div>
      </div>
    </button>
  )
}
