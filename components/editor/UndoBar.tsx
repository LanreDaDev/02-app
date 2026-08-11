'use client'

import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import type { PendingDelete } from '@/lib/hooks/useSlots'

/**
 * The undo window, made visible.
 *
 * A deleted clip has not been sent anywhere yet — this bar is the delete, and it
 * is running out. Showing the time draining is the honest version: the agent can
 * see how long they have rather than guessing whether the moment has passed.
 *
 * Deliberately not a general toast system. This is the only thing in the editor
 * that needs taking back, and a queue of stacking notifications would be a
 * larger idea than the one problem it solves.
 */
export function UndoBar({
  pending,
  windowMs,
  onUndo,
}: {
  pending: PendingDelete | null
  windowMs: number
  onUndo: () => void
}) {
  const [remaining, setRemaining] = useState(1)

  useEffect(() => {
    if (!pending) return

    const started = Date.now()
    setRemaining(1)

    const id = setInterval(() => {
      const left = 1 - (Date.now() - started) / windowMs
      setRemaining(left > 0 ? left : 0)
    }, 60)

    return () => clearInterval(id)
    // Keyed on the id so deleting a second clip restarts the countdown.
  }, [pending?.id, pending, windowMs])

  if (!pending) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center"
    >
      <div className="pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card px-3.5 py-2.5 shadow-lg">
        <span className="text-[12.5px] text-foreground">
          Deleted <span className="font-medium">{pending.name}</span>
          {/* Takes are named because they were paid for, and the cascade takes
              them too. This is the last moment that is reversible. */}
          {pending.takes > 0 && (
            <span className="text-muted-foreground">
              {' '}
              and {pending.takes} take{pending.takes === 1 ? '' : 's'}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] text-foreground transition-colors hover:bg-muted"
        >
          <Undo2 size={12} />
          Undo
        </button>

        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[2px] bg-warning transition-[width] duration-75 ease-linear"
          style={{ width: `${remaining * 100}%` }}
        />
      </div>
    </div>
  )
}
