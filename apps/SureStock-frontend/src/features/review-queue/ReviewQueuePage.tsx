import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageContainer } from '../../components/PageContainer'
import { PageHeader } from '../../components/PageHeader'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { Tabs } from '../../components/Tabs'
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
    <PageContainer>
      <PageHeader title="Review queue" subtitle="Offline sales that need a manager's judgment call before they're settled." />

      <Tabs
        className="mt-4"
        tabs={STATUS_TABS.map((tab) => ({ key: tab.value, label: tab.label }))}
        active={status}
        onChange={(key) => {
          setStatus(key as typeof status)
          setPage(1)
        }}
      />

      <div className="mt-4">
        <div className="hidden md:block">
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
                    <TableCell className="whitespace-nowrap">
                      <Pill variant={item.type === 'NEGATIVE_STOCK' ? 'warning' : 'danger'}>{TYPE_LABEL[item.type]}</Pill>
                    </TableCell>
                    <TableCell className="max-w-xs">{item.reason}</TableCell>
                    <TableCell className="whitespace-nowrap">
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
                    <TableCell className="whitespace-nowrap text-ink-muted">{formatDate(item.createdAt)}</TableCell>
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
        </div>

        <div className="flex flex-col gap-2 md:hidden">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[110px] animate-pulse rounded-lg border border-border bg-surface-raised" />)}
          {!isLoading && items.length === 0 && (
            <p className="rounded-lg border border-border bg-surface-raised p-6 text-center text-sm text-ink-muted">Nothing here.</p>
          )}
          {!isLoading &&
            items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-surface-raised p-3">
                <div className="flex items-start justify-between gap-2">
                  <Pill variant={item.type === 'NEGATIVE_STOCK' ? 'warning' : 'danger'}>{TYPE_LABEL[item.type]}</Pill>
                  {!item.resolvedAt && (
                    <button
                      type="button"
                      onClick={() => setResolvingItem(item)}
                      className="flex-none font-display text-[13px] font-medium text-accent hover:text-accent-strong"
                    >
                      Resolve
                    </button>
                  )}
                </div>
                <p className="mt-2 font-display text-[13px] text-ink">{item.reason}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-[12px] text-ink-faint">
                  {item.saleReceiptNumber && item.saleId ? (
                    <Link to={`/sales/${item.saleId}`} className="font-mono text-accent hover:text-accent-strong">
                      {item.saleReceiptNumber}
                    </Link>
                  ) : (
                    item.variantSku && <span className="font-mono text-ink-muted">{item.variantSku}</span>
                  )}
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                {item.resolvedAt ? (
                  <div className="mt-2 border-t border-border pt-2">
                    <p className="font-display text-[13px] text-ink">{item.resolutionNote}</p>
                    <p className="font-display text-[11.5px] text-ink-faint">
                      {item.resolvedByName} · {formatDate(item.resolvedAt)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 border-t border-border pt-2 font-display text-[12px] text-ink-faint">Open</p>
                )}
              </div>
            ))}
        </div>

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
    </PageContainer>
  )
}
