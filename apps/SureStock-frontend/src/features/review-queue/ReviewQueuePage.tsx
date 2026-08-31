import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { listReviewQueue } from '../../lib/api/review-queue'
import type { ReviewQueueItem } from '../../lib/api/types'
import { ResolveReviewQueueDialog } from './ResolveReviewQueueDialog'

const STATUS_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
] as const

const TYPE_LABEL: Record<ReviewQueueItem['type'], string> = {
  NEGATIVE_STOCK: 'Negative stock',
  SYNC_VALIDATION_FAILURE: 'Sync failure',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * T-23: what a Manager/Owner works through after offline sales sync — a
 * NEGATIVE_STOCK item means an offline sale was accepted even though it
 * took stock below zero (Doc 2 §3.2's offline half of the negative-stock
 * decision); a SYNC_VALIDATION_FAILURE means a queued sale hit a real
 * business-rule rejection on replay (see sync.service.ts's own doc
 * comment on why only well-formed rejections land here, not infra faults).
 * Defaults to open items, since a review queue is meant to be worked down
 * to zero, not paged through as history — same reasoning as the backend's
 * own default.
 */
export function ReviewQueuePage() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'all'>('open')
  const [page, setPage] = useState(1)
  const [resolvingItem, setResolvingItem] = useState<ReviewQueueItem | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['review-queue', status, page],
    queryFn: () => listReviewQueue({ status, page, pageSize: 20 }),
  })

  const items = data?.items ?? []

  return (
    <main className="p-6">
      <h1 className="font-display text-2xl font-bold text-ink">Review queue</h1>
      <p className="mt-0.5 font-body text-sm text-ink-muted">Offline sales that need a manager's judgment call before they're settled.</p>

      <div className="mt-4 flex gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value)
              setPage(1)
            }}
            className={
              status === tab.value
                ? 'border-b-2 border-accent px-3 py-2 font-display text-sm font-semibold text-accent-strong'
                : 'border-b-2 border-transparent px-3 py-2 font-display text-sm text-ink-muted hover:text-ink'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Sale / SKU</TableHead>
              <TableHead>Flagged</TableHead>
              <TableHead>Resolution</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={5} columns={6} />}
            {!isLoading && items.length === 0 && <TableEmpty columns={6} message="Nothing here." />}
            {!isLoading &&
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Pill variant={item.type === 'NEGATIVE_STOCK' ? 'warning' : 'danger'}>{TYPE_LABEL[item.type]}</Pill>
                  </TableCell>
                  <TableCell className="max-w-xs">{item.reason}</TableCell>
                  <TableCell>
                    {item.saleReceiptNumber && item.saleId ? (
                      <Link to={`/sales/${item.saleId}`} className="font-mono text-accent hover:text-accent-strong">
                        {item.saleReceiptNumber}
                      </Link>
                    ) : item.variantSku ? (
                      <span className="font-mono text-ink-muted">{item.variantSku}</span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-muted">{formatDate(item.createdAt)}</TableCell>
                  <TableCell>
                    {item.resolvedAt ? (
                      <div>
                        <p className="text-ink">{item.resolutionNote}</p>
                        <p className="text-[11.5px] text-ink-faint">
                          {item.resolvedByName} · {formatDate(item.resolvedAt)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-ink-faint">Open</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!item.resolvedAt && (
                      <button
                        type="button"
                        onClick={() => setResolvingItem(item)}
                        className="font-display text-[13px] font-medium text-accent hover:text-accent-strong"
                      >
                        Resolve
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {data && data.totalCount > 0 && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            totalCount={data.totalCount}
            totalPages={data.totalPages}
            onPageChange={setPage}
            itemLabel="items"
          />
        )}
      </div>

      {resolvingItem && <ResolveReviewQueueDialog item={resolvingItem} onClose={() => setResolvingItem(null)} />}
    </main>
  )
}
