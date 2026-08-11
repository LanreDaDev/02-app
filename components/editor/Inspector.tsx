'use client'

import { useState } from 'react'
import { Film, Image as ImageIcon, Sparkles, Trash2, X } from 'lucide-react'
import { useEditorStore } from '@/lib/stores/useEditorStore'
import { useTimelineStore } from '@/lib/stores/useTimelineStore'
import { runtimeSeconds } from '@/lib/editor/runtime'
import { cn } from '@/lib/utils'
import {
  CLIP_DURATIONS,
  CLIP_DURATION_LABELS,
  STILL_MOTION_LABELS,
  aggressionZone,
  defaultMotionFor,
  motionOptions,
} from '@/lib/editor/motions'
import { changedSince, joinChanges } from '@/lib/editor/dirty'
import type { EditorPhoto } from '@/lib/hooks/usePhotos'
import type { SlotKind, SlotTake, SlotWithTakes, StillMotion } from '@/lib/types/database'

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
  /** Reversible for a few seconds — the undo bar is the confirmation. */
  onDelete?: (slotId: string) => void
  /** Switch which paid-for take is active. Instant; nothing regenerates. */
  onSelectTake?: (slotId: string, takeId: string) => Promise<void>
  generating?: boolean
  /** Tokens for the selected length, so the button can say what it costs. */
  costTokens: number
  /** Shown when nothing is selected. The resting state, not an empty one. */
  project?: { title: string; aspectRatio: string }
}

export function Inspector({
  uploads,
  extractedFrames,
  onPatch,
  onGenerate,
  onDelete,
  onSelectTake,
  generating,
  costTokens,
  project,
}: InspectorProps) {
  const slots = useEditorStore((s) => s.slots)
  const selectedSlotId = useEditorStore((s) => s.selectedSlotId)
  const slot = slots.find((s) => s.id === selectedSlotId) ?? null

  const [saveError, setSaveError] = useState<string | null>(null)

  // What the panel says versus what the take on screen was actually made with.
  const changes = slot ? changedSince(slot, slot.activeTake) : []

  async function selectTake(takeId: string) {
    if (!slot || !onSelectTake) return
    setSaveError(null)
    try {
      await onSelectTake(slot.id, takeId)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not switch take')
    }
  }

  // Nothing selected is not an empty state — it is the project. This is why
  // there is no settings page and no fourth panel, and it is what the agent
  // lands on every time they open the editor.
  if (!slot) {
    return (
      <aside className="flex h-full w-full min-w-0 shrink-0 flex-col border-l border-border bg-card">
        <ProjectSettings project={project} slots={slots} />
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
    <aside className="flex h-full w-full min-w-0 shrink-0 flex-col border-l border-border bg-card">
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

            {/* Only worth showing once there is a choice to make. */}
            {slot.takes.length > 1 && (
              <Field label="Takes" hint="Switching is instant">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {slot.takes.map((take, i) => (
                    <TakeThumb
                      key={take.id}
                      take={take}
                      // Newest first, so the most recent result is where the
                      // eye already is.
                      number={slot.takes.length - i}
                      active={take.id === slot.activeTake?.id}
                      onSelect={() => void selectTake(take.id)}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Every take you have paid for is kept. Going back to one costs
                  nothing.
                </p>
              </Field>
            )}
          </>
        )}

        {/* Last, quiet, and below everything worth doing. The keyboard is where
            this actually gets used mid-review; this is here so it can be found
            at all, and so the shortcut has somewhere to be written down. */}
        {onDelete && (
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => onDelete(slot.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={11} />
              Delete clip
              <span className="font-mono text-[10px] opacity-60">⌫</span>
            </button>
          </div>
        )}
      </div>

      {!isStill && (
        <div className="border-t border-border p-3">
          {/* The take on screen no longer matches the panel above it. Say so
              plainly and name what changed — otherwise the agent moves a
              control, sees nothing happen, and decides it is broken. */}
          {changes.length > 0 && (
            <p className="mb-2.5 rounded-md border border-warning/35 bg-warning/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-warning">
              You changed {joinChanges(changes)} since this take was made. It
              keeps playing until you generate again.
            </p>
          )}

          <button
            type="button"
            onClick={() => void onGenerate(slot.id)}
            disabled={!canGenerate}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm transition-opacity',
              // Dirty makes regenerating the obvious next move, so it takes the
              // accent. Otherwise it is a secondary act beside a take that is
              // already correct.
              changes.length > 0
                ? 'bg-warning text-background hover:opacity-90'
                : 'bg-primary text-primary-foreground hover:opacity-90',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <Sparkles size={14} />
            {generating
              ? 'Generating…'
              : changes.length > 0
                ? `Generate with new settings · ${costTokens}`
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

/**
 * Everything about the video, when no one clip is in question.
 *
 * Only what the schema actually holds. A music or brand-kit group would have to
 * be invented here, and a control that stores nothing is worse than a missing
 * one — the agent sets it, it does nothing, and they stop trusting the panel.
 */
function ProjectSettings({
  project,
  slots,
}: {
  project?: { title: string; aspectRatio: string }
  slots: SlotWithTakes[]
}) {
  const ready = slots.filter((s) => s.state === 'ready')
  const notReady = slots.filter((s) => s.state !== 'ready')

  // The same figure the top bar and the timeline show, from the same function.
  const clips = useTimelineStore((s) => s.clips)
  const runtime = runtimeSeconds(slots, clips)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-medium text-foreground">
          {project?.title || 'Project'}
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
          Nothing selected — this is the whole video and everything about it.
        </p>
      </header>

      <Group label="Format">
        <Row label="Aspect ratio" value={project?.aspectRatio ?? '—'} />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Chosen when the project was created, and permanent. A second format
          means a second project.
        </p>
        <Row label="Runtime" value={`${runtime.toFixed(1)}s`} />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          An estimate until every clip is generated.
        </p>
      </Group>

      <Group label="Sequence">
        <Row label="Clips" value={String(slots.length)} />
        <Row label="Ready" value={`${ready.length}/${slots.length}`} />

        {notReady.length > 0 && (
          <div className="mt-1">
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              Export waits for these:
            </p>
            <ul className="flex flex-col gap-1">
              {/* By name, not by number. "Clip 14 isn't ready" tells the agent
                  nothing; "Primary bedroom isn't ready" is actionable. */}
              {notReady.map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline justify-between gap-2 text-[11.5px]"
                >
                  <span className="truncate text-foreground">{s.name}</span>
                  <span
                    className={cn(
                      'shrink-0 text-[11px]',
                      s.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {s.state === 'failed'
                      ? 'Failed'
                      : s.state === 'draft'
                        ? 'Needs a photo'
                        : s.state === 'running'
                          ? 'Generating'
                          : 'Queued'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {slots.length > 0 && notReady.length === 0 && (
          <p className="text-[11.5px] leading-relaxed text-success">
            Every clip is ready. This video can be exported.
          </p>
        )}
      </Group>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-border p-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12.5px] text-foreground">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
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

function TakeThumb({
  take,
  number,
  active,
  onSelect,
}: {
  take: SlotTake
  number: number
  active: boolean
  onSelect: () => void
}) {
  const poster = take.mux_playback_id
    ? `https://image.mux.com/${take.mux_playback_id}/thumbnail.webp?width=120&fit_mode=smartcrop`
    : null

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`Take ${number}${active ? ', playing' : ''}`}
      className={cn(
        'relative aspect-video w-[68px] shrink-0 overflow-hidden rounded border transition-colors',
        active ? 'border-warning ring-1 ring-warning' : 'border-border hover:border-foreground/30'
      )}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="grid h-full w-full place-items-center bg-muted">
          <Film size={12} className="text-muted-foreground" />
        </span>
      )}
      <span className="absolute left-1 top-1 rounded bg-background/75 px-1 font-mono text-[9px] tabular-nums leading-tight text-foreground">
        {number}
      </span>
    </button>
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
