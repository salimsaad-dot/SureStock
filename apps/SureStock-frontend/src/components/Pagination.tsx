import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PaginationProps {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  onPageChange: (page: number) => void
  itemLabel: string
  pageSizeOptions?: number[]
  onPageSizeChange?: (size: number) => void
}

/** Numbered pagination — safe for an append-only, insert-at-head list (sales, till shifts) where a fixed page never shifts under concurrent writes; see sale.schemas.ts's doc comment for why this differs from Inventory's cursor pagination. */
export function Pagination({ page, pageSize, totalCount, totalPages, onPageChange, itemLabel, pageSizeOptions, onPageSizeChange }: PaginationProps) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1].filter((p) => p >= 1 && p <= totalPages))
  const sorted = [...pages].sort((a, b) => a - b)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="font-display text-[13px] text-ink-muted">
        Showing {from} to {to} of {totalCount} {itemLabel}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {sorted.map((p, i) => (
          <span key={p} className="flex items-center">
            {i > 0 && sorted[i - 1]! < p - 1 && <span className="px-1 text-ink-faint">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={
                p === page
                  ? 'flex h-8 w-8 items-center justify-center rounded-md bg-accent font-mono text-[13px] font-semibold text-white'
                  : 'flex h-8 w-8 items-center justify-center rounded-md font-mono text-[13px] text-ink-muted hover:bg-surface-sunken'
              }
            >
              {p}
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {pageSizeOptions && onPageSizeChange && (
        <label className="flex items-center gap-2">
          <span className="font-display text-[13px] text-ink-muted">Per page</span>
          <select
            className="h-9 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-[13px] text-ink"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
