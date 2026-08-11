'use client'

import { useState } from 'react'
import { Film, Image as ImageIcon, Sparkles, X } from 'lucide-react'
import { useEditorStore } from '@/lib/stores/useEditorStore'
import { cn } from '@/lib/utils'
import {
  CLIP_DURATIONS,
  CLIP_DURATION_LABELS,
  STILL_MOTION_LABELS,
  aggressionZone,
  defaultMotionFor,
  motionOptions,
} from '@/lib/editor/motions'
import type { EditorPhoto } from '@/lib/hooks/usePhotos'
import type { ClipDuration, SlotKind, StillMotion } from '@/lib/types/database'

/**
 * The inspector: everything about the selected slot.
 *
 * Context-sensitive by kind, because a still and a generated clip genuinely do
 * not share controls. A still has no camera preset and no length the model
 * imposes; a generated clip has no unbounded hold. Showing both sets and
 * greying half out would only suggest the greyed half might apply.
 *
 * Reads the selection from the store like every other surface. It never takes
 * a slot as a prop — a prop is a second copy of the answer.
 */

interface InspectorProps {
  uploads: EditorPhoto[]
  extractedFrames: EditorPhoto[]
  onPatch: (slotId: string, patch: Record<string, unknown>) => Promise<void>
  onGenerate: (slotId: string) => void | Promise<void>
  generating?: boolean
  /** Tokens for the selected length, so the button can say what it costs. */
  costTokens: number
}

export function Inspector({
  uploads,
  extractedFrames,
  onPatch,
  onGenerate,
  generating,
  costTokens,
}: InspectorProps) {
  const slots = useEditorStore((s) => s.slots)
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)
  const slot = slots.find((s) => s.id === selectedSlotId) ?? null

  const [saveError, setSaveError] = useState<string | null>(null)

  if (!slot) {
    return (
      <aside className="flex h-full w-full min-w-0 shrink-0 flex-col border-l border-border bg-card">
        <div className="mt-10 px-6 text-center">
          <p className="text-sm text-foreground">Nothing selected</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Pick a clip from the sequence to change how it looks or make it
            again.
          </p>
        </div>
      </aside>
    )
  }

  const isStill = slot.kind === 'still'
  const hasEndFrame = Boolean(slot.end_photo_id)

  async function patch(p: Record<string, unknown>) {
    if (!slot) return
    setSaveError(null)
    try {
      await onPatch(slot.id, p)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save that change')
    }
  }

  // Changing frame count invalidates the preset — the two sets share no keys,
  // so carrying the old one over would send the worker something it will
  // silently replace with a default.
  async function setEndPhoto(photoId: string | null) {
    const nextHasEnd = Boolean(photoId)
    await patch({
      endPhotoId: photoId,
      ...(nextHasEnd !== hasEndFrame ? { cameraMotion: defaultMotionFor(nextHasEnd) } : {}),
    })
  }

  const canGenerate = Boolean(slot.start_photo_id) && !isStill && !generating

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <input
          value={slot.name}
          onChange={(e) => void patch({ name: e.target.value })}
          aria-label="Clip name"
          className={cn(
            'w-full bg-transparent text-sm text-foreground outline-none',
            'rounded px-1 py-0.5 -mx-1 focus:bg-muted'
          )}
        />
        <KindToggle
          kind={slot.kind}
          onChange={(kind) => void patch({ kind })}
        />
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {saveError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[12px] text-destructive">
            {saveError}
          </p>
        )}

        <Field label={isStill ? 'Photo' : 'Start frame'}>
          <PhotoPicker
            photos={uploads}
            selectedId={slot.start_photo_id}
            onSelect={(id) => void patch({ startPhotoId: id })}
          />
        </Field>

        {!isStill && (
          <Field
            label="End frame"
            hint={
              hasEndFrame
                ? 'The camera travels from the first framing to this one.'
                : 'Optional. Without one the camera moves within the shot.'
            }
          >
            {hasEndFrame ? (
              <button
                type="button"
                onClick={() => void setEndPhoto(null)}
                className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <X size={11} />
                Remove end frame
              </button>
            ) : null}
            <PhotoPicker
              photos={uploads}
              selectedId={slot.end_photo_id}
              excludeId={slot.start_photo_id}
              onSelect={(id) => void setEndPhoto(id)}
            />
            {extractedFrames.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {extractedFrames.length} frame
                {extractedFrames.length === 1 ? '' : 's'} from finished clips can
                also start the next one.
              </p>
            )}
          </Field>
        )}

        {isStill ? (
          <>
            <Field label="Movement">
              <Select
                value={slot.still_motion}
                onChange={(v) => void patch({ stillMotion: v as StillMotion })}
                options={Object.entries(STILL_MOTION_LABELS)}
              />
            </Field>

            <Field
              label="Hold"
              hint="Stills resize freely — there is no take to trim against."
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.5}
                  max={15}
                  step={0.5}
                  value={slot.hold_duration_seconds}
                  onChange={(e) =>
                    void patch({ holdDurationSeconds: Number(e.target.value) })
                  }
                  className="flex-1 accent-[var(--warning)]"
                  aria-label="Hold duration"
                />
                <span className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                  {slot.hold_duration_seconds}s
                </span>
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label="Camera">
              <Select
                value={slot.camera_motion ?? defaultMotionFor(hasEndFrame)}
                onChange={(v) => void patch({ cameraMotion: v })}
                options={motionOptions(hasEndFrame)}
              />
            </Field>

            <Field label="Motion" hint={aggressionZone(slot.motion_aggression)}>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={slot.motion_aggression}
                  onChange={(e) =>
                    void patch({ motionAggression: Number(e.target.value) })
                  }
                  className="flex-1 accent-[var(--warning)]"
                  aria-label="Motion aggression"
                />
                <span className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                  {slot.motion_aggression}
                </span>
              </div>
            </Field>

            <Field
              label="Length"
              hint="Short suits most rooms."
            >
              <div className="flex gap-1.5">
                {CLIP_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => void patch({ durationSeconds: d })}
                    aria-pressed={slot.duration_seconds === d}
                    aria-label={`${CLIP_DURATION_LABELS[d]}, ${d} seconds`}
                    className={cn(
                      'flex flex-1 flex-col items-center gap-0.5 rounded-md border py-1.5 transition-colors',
                      slot.duration_seconds === d
                        ? 'border-warning bg-warning/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <span className="text-[12px] leading-none">
                      {CLIP_DURATION_LABELS[d]}
                    </span>
                    {/* The number stays: runtime is the sum of these, and the
                        agent should be able to see where it comes from. */}
                    <span className="font-mono text-[10px] leading-none tabular-nums opacity-60">
                      {d}s
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Longer holds the screen — worth it on the exterior and the view.
              </p>
            </Field>
          </>
        )}
      </div>

      {!isStill && (
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => void onGenerate(slot.id)}
            disabled={!canGenerate}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm transition-opacity',
              'bg-primary text-primary-foreground hover:opacity-90',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <Sparkles size={14} />
            {generating
              ? 'Generating…'
              : slot.takes.length > 0
                ? `Generate again · ${costTokens}`
                : `Generate · ${costTokens}`}
          </button>
          {!slot.start_photo_id && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Choose a photo first.
            </p>
          )}
        </div>
      )}
    </aside>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-foreground">{label}</span>
        {hint && (
          <span className="text-right text-[11px] leading-tight text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function KindToggle({
  kind,
  onChange,
}: {
  kind: SlotKind
  onChange: (kind: SlotKind) => void
}) {
  // Non-destructive both ways: takes survive the switch, so going back finds
  // them again. Nothing the agent paid for is thrown away by a toggle.
  const options: { value: SlotKind; label: string; icon: typeof Film }[] = [
    { value: 'generated', label: 'Clip', icon: Film },
    { value: 'still', label: 'Still', icon: ImageIcon },
  ]

  return (
    <div className="mt-2 flex gap-1">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={kind === value}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md border py-1 text-[12px] transition-colors',
            kind === value
              ? 'border-warning bg-warning/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          <Icon size={11} />
          {label}
        </button>
      ))}
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/30"
    >
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  )
}

function PhotoPicker({
  photos,
  selectedId,
  excludeId,
  onSelect,
}: {
  photos: EditorPhoto[]
  selectedId: string | null
  excludeId?: string | null
  onSelect: (id: string) => void
}) {
  // A slot's two frames must differ — the database rejects it, so the picker
  // should never offer it in the first place.
  const available = photos.filter((p) => p.id !== excludeId)

  if (available.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[12px] text-muted-foreground">
        No photos uploaded yet.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {available.map((photo) => (
        <button
          key={photo.id}
          type="button"
          onClick={() => onSelect(photo.id)}
          aria-pressed={photo.id === selectedId}
          title={photo.file_name ?? undefined}
          className={cn(
            'aspect-square overflow-hidden rounded-md border transition-colors',
            photo.id === selectedId
              ? 'border-warning ring-1 ring-warning'
              : 'border-border hover:border-foreground/30'
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.s3_url}
            alt={photo.file_name ?? ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  )
}
