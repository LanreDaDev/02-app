'use client'

import { useEffect, useRef } from 'react'
import { Film, Image as ImageIcon, Plus, AlertCircle } from 'lucide-react'
import { useEditorStore } from '@/lib/stores/useEditorStore'
import { cn } from '@/lib/utils'
import type { EditorPhoto } from '@/lib/hooks/usePhotos'
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
  readyCount?: number
  /** Resolves a slot's frame ids to images. The card's thumbnails are the
   *  clearest signal of which kind of slot it is, so they matter. */
  photos?: EditorPhoto[]
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

export function SequenceRail({
  onAddSlot,
  adding,
  readyCount,
  photos = [],
}: SequenceRailProps) {
  const slots = useEditorStore((s) => s.slots)
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)
  const select = useEditorStore((s) => s.select)

  const photoById = new Map(photos.map((p) => [p.id, p]))

  // Walking the sequence with the arrow keys selects cards faster than the rail
  // scrolls, so the selection has to bring itself into view. `nearest` keeps a
  // card that is already visible exactly where it is, rather than yanking the
  // list on every press.
  const selectedRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedSlotId])

  return (
    <aside className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-card">
      {/* Add clip is pinned at the top, with the primary action above the list
          rather than below it — the agent reaches for it before scanning. */}
      <header className="flex flex-none flex-col gap-2.5 border-b border-border px-3.5 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-foreground">Sequence</h2>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {readyCount ?? 0}/{slots.length} ready
          </span>
        </div>
        <button
          type="button"
          onClick={() => void onAddSlot()}
          disabled={adding}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg border border-border',
            'bg-muted/60 px-3 py-2 text-[12.5px] text-foreground transition-colors',
            'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Plus size={13} />
          {adding ? 'Adding…' : 'Add clip'}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {slots.length === 0 ? (
          <EmptyRail />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {slots.map((slot, i) => (
              <li key={slot.id} ref={slot.id === selectedSlotId ? selectedRef : undefined}>
                <SlotCard
                  slot={slot}
                  index={i}
                  selected={slot.id === selectedSlotId}
                  onSelect={() => select(slot.id)}
                  startPhoto={
                    slot.start_photo_id ? photoById.get(slot.start_photo_id) : undefined
                  }
                  endPhoto={
                    slot.end_photo_id ? photoById.get(slot.end_photo_id) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function EmptyRail() {
  // An invitation to act, not a wall of disabled placeholder cards. The action
  // itself is already pinned in the header above.
  return (
    <div className="mt-10 px-4 text-center">
      <p className="text-[15px] text-foreground">Build your sequence</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        Add a clip, choose one or two photos, and pick how the camera moves.
      </p>
    </div>
  )
}

interface SlotCardProps {
  slot: SlotWithTakes
  index: number
  selected: boolean
  onSelect: () => void
  startPhoto?: EditorPhoto
  endPhoto?: EditorPhoto
}

/**
 * A card carries no duration and no time axis — that is the timeline's job.
 * The rail is semantic: which slot, which kind, what state. Two surfaces
 * answering the same question differently is how they start disagreeing.
 */
function SlotCard({
  slot,
  index,
  selected,
  onSelect,
  startPhoto,
  endPhoto,
}: SlotCardProps) {
  const isStill = slot.kind === 'still'
  // Two frames means the camera travels between them; one means it moves within
  // the shot. Showing that on the card is the fastest way to read a sequence.
  const twoFrames = !isStill && Boolean(slot.end_photo_id)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors',
        selected
          ? 'border-warning bg-warning/10'
          : 'border-border bg-background hover:border-foreground/20 hover:bg-muted'
      )}
    >
      <span className="w-4 shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <Thumb photo={startPhoto} isStill={isStill} wide={!twoFrames} />
        {twoFrames && (
          <span className="font-mono text-[9px] text-muted-foreground">→</span>
        )}
        {twoFrames && <Thumb photo={endPhoto} isStill={false} wide={false} />}
      </div>

      <div className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-foreground">
          {slot.name}
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATE_DOT[slot.state])} />
          <span
            className={cn(
              'truncate text-[11px]',
              slot.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {slot.state === 'failed' && (
              <AlertCircle size={10} className="mr-1 inline align-[-1px]" />
            )}
            {STATE_LABEL[slot.state]}
          </span>
        </span>
      </div>
    </button>
  )
}

function Thumb({
  photo,
  isStill,
  wide,
}: {
  photo?: EditorPhoto
  isStill: boolean
  wide: boolean
}) {
  return (
    <span
      className={cn(
        'grid h-[38px] shrink-0 place-items-center overflow-hidden rounded bg-muted',
        wide ? 'w-[54px]' : 'w-[34px]',
        // A slot with no photo yet reads as an empty target, not a broken image.
        !photo && 'border border-dashed border-border'
      )}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.s3_url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : isStill ? (
        <ImageIcon size={12} className="text-muted-foreground" />
      ) : (
        <Film size={12} className="text-muted-foreground" />
      )}
    </span>
  )
}
