import type { ReactNode } from 'react'

/** One line + the action that fills it — no illustration, per Doc 4. Non-table contexts; see TableEmpty for inside a table. */
export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-raised py-10 text-center">
      <p className="font-display text-sm text-ink-muted">{message}</p>
      {action}
    </div>
  )
}
