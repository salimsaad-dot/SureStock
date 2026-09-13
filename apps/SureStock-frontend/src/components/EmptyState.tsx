import type { ReactNode } from 'react'

/** Icon-in-a-circle + one line + the action that fills it — no illustration, per Doc 4. Non-table contexts; see TableEmpty for inside a table. */
export function EmptyState({ icon, message, action }: { icon?: ReactNode; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-raised py-10 text-center">
      {icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-ink-faint" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="font-display text-sm text-ink-muted">{message}</p>
      {action}
    </div>
  )
}
