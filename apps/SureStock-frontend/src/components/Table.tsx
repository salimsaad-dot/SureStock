import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

/**
 * Real gap found via live mobile testing: on a narrow screen a wide
 * table (e.g. Inventory's actions column) needs horizontal scrolling,
 * but nothing signaled that — it just looked cut off. This is the
 * classic pure-CSS "scroll shadow" technique (no JS): two opaque-to-
 * transparent masks matching the card background keep the edges clean,
 * and two small radial-gradient shadows sit just inside them, pinned to
 * the viewport (`background-attachment: scroll`) rather than the
 * scrolling content (`local`) — so a shadow only actually appears on
 * whichever side still has more to scroll toward, and both disappear
 * once you've scrolled all the way. Genuinely responds to scroll
 * position with zero JavaScript.
 */
const SCROLL_SHADOW_STYLE = {
  background: [
    'linear-gradient(to right, var(--surface-raised) 30%, transparent)',
    'linear-gradient(to right, transparent, var(--surface-raised) 70%) 100% 0',
    'radial-gradient(farthest-side at 0 50%, rgba(0,0,0,.2), transparent)',
    'radial-gradient(farthest-side at 100% 50%, rgba(0,0,0,.2), transparent) 100% 0',
  ].join(', '),
  backgroundRepeat: 'no-repeat',
  backgroundColor: 'var(--surface-raised)',
  backgroundSize: '24px 100%, 24px 100%, 10px 100%, 10px 100%',
  backgroundAttachment: 'local, local, scroll, scroll',
} as const

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border" style={SCROLL_SHADOW_STYLE}>
      <table className={cn('w-full border-collapse font-display text-[13px]', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-surface-sunken', className)} {...props} />
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-border last:border-none transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-3 py-3 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Money/quantity columns: add `text-right tabular-nums` at the call site
 * (no dedicated prop here — Table stays variant-free by design). Action
 * columns: right-align via the same convention for consistency.
 */
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-3 text-ink', className)} {...props} />
}

/** Skeleton rows matching real row height — no layout shift when data arrives (Blueprint §06). */
export function TableSkeleton({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <TableCell key={colIndex}>
              <div className="h-3.5 w-full animate-pulse rounded bg-surface-sunken" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

/** One line + the action that fills it — no illustration, per Doc 4. */
export function TableEmpty({
  columns,
  message,
  action,
}: {
  columns: number
  message: string
  action?: ReactNode
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={columns} className="py-8 text-center">
        <p className="text-ink-muted">{message}</p>
        {action && <div className="mt-3 flex justify-center">{action}</div>}
      </TableCell>
    </TableRow>
  )
}
