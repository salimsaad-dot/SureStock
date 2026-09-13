import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * Extracts the `flex flex-wrap items-end gap-3` filter-row wrapper
 * independently hand-rolled on Inventory, Sales, Purchasing, and Stock
 * Take's start screen — each page still renders its own TextInput/select
 * fields as children (they're genuinely different per page), this just
 * standardizes the row layout and the optional "Clear filters" action.
 * Reports' `<details>`-based popover filter is a deliberate outlier and
 * does not use this.
 */
export function FilterToolbar({
  children,
  onClear,
  className,
}: {
  children: ReactNode
  /** Omit to hide the "Clear filters" link — pages show it only when a filter is actually active. */
  onClear?: () => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      {children}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="font-display text-[13px] font-medium text-accent hover:text-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
