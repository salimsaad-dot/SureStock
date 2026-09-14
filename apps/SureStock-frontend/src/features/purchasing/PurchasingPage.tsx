import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, FileText, PackageCheck, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { FilterToolbar } from '../../components/FilterToolbar'
import { PageContainer } from '../../components/PageContainer'
import { PageHeader } from '../../components/PageHeader'
import { Pagination } from '../../components/Pagination'
import { StatCard } from '../../components/StatCard'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { Tabs } from '../../components/Tabs'
import { getPurchaseOrderStats, listPurchaseOrders } from '../../lib/api/purchasing'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'
import { useToast } from '../../lib/toast-store'
import { SuppliersPanel } from '../catalogue/SuppliersPanel'
import { PurchaseOrderFormDialog, type PurchaseOrderFormInitial } from './PurchaseOrderFormDialog'
import { PurchaseOrderStatusPill } from './PurchaseOrderStatusPill'
import { RestockSummaryPanel, RestockTab } from './RestockPanel'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

const STATUS_FILTERS: { value: PurchaseOrderStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Pending' },
  { value: 'PARTIAL', label: 'Partially received' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/** Doc 3/mockup: Purchasing — purchase orders, suppliers, and restock recommendations. Manager/Owner only, same gate as suppliers. */
export function PurchasingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const show = useToast()

  const [tab, setTab] = useState<'orders' | 'suppliers' | 'restock'>('orders')
  const [status, setStatus] = useState<PurchaseOrderStatus | ''>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [formInitial, setFormInitial] = useState<PurchaseOrderFormInitial | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const { data: stats } = useQuery({ queryKey: ['purchase-orders', 'stats'], queryFn: getPurchaseOrderStats })
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { status, page, pageSize }],
    queryFn: () => listPurchaseOrders({ status: status || undefined, page, pageSize }),
    enabled: tab === 'orders',
  })

  function openNewOrder(initial?: PurchaseOrderFormInitial) {
    setFormInitial(initial ?? null)
    setFormOpen(true)
  }

  function handleCreated(po: PurchaseOrder) {
    setFormOpen(false)
    setFormInitial(null)
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    queryClient.invalidateQueries({ queryKey: ['restock-recommendations'] })
    show(`${po.orderNumber} created.`)
    navigate(`/purchasing/${po.id}`)
  }

  const orders = data?.items ?? []

  return (
    <PageContainer>
      <PageHeader
        title="Purchasing"
        subtitle="Manage purchase orders, suppliers and restock recommendations."
        actions={
          <Button onClick={() => openNewOrder()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New purchase order
          </Button>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<FileText className="h-5 w-5" aria-hidden="true" />}
          label="Draft"
          value={stats?.draft.orders ?? 0}
          sublabel={`orders · ${formatPesewas(stats?.draft.total ?? 0)}`}
          tone="neutral"
        />
        <StatCard
          icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}
          label="Pending"
          value={stats?.pending.orders ?? 0}
          sublabel={`orders · ${formatPesewas(stats?.pending.total ?? 0)}`}
          tone="warning"
        />
        <StatCard
          icon={<PackageCheck className="h-5 w-5" aria-hidden="true" />}
          label="Partially received"
          value={stats?.partiallyReceived.orders ?? 0}
          sublabel={`orders · ${formatPesewas(stats?.partiallyReceived.total ?? 0)}`}
          tone="accent"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          label="Received"
          value={stats?.received.orders ?? 0}
          sublabel={`orders · ${formatPesewas(stats?.received.total ?? 0)}`}
          tone="success"
        />
      </div>

      {stats && (
        <p className="mt-3 font-display text-sm text-ink-muted">
          Total purchased this period: <span className="font-mono font-semibold text-ink">{formatPesewas(stats.totalPurchased)}</span>
        </p>
      )}

      <Tabs
        className="mt-6"
        tabs={[
          { key: 'orders', label: 'Purchase orders' },
          { key: 'suppliers', label: 'Suppliers' },
          { key: 'restock', label: 'Restock' },
        ]}
        active={tab}
        onChange={(key) => setTab(key as typeof tab)}
      />

      {/* tab === 'orders' panel. minmax(0,1fr) below, not a bare 1fr — a
          raw arbitrary grid-template-columns value doesn't get
          Tailwind's usual minmax(0,...) treatment, so the track's
          automatic minimum defaults to content-based `auto`. That let
          this column refuse to shrink below the nowrap table's natural
          width, forcing the whole page wider than the viewport next to
          the fixed 320px restock panel at laptop widths (1024-1280px) —
          the CSS Grid version of the flexbox min-width:auto trap fixed
          elsewhere all session, just via `grid-template-columns`
          instead of `flex`. */}
      {tab === 'orders' && (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <FilterToolbar>
              <label className="flex flex-col gap-1.5">
                <span className="font-display text-[13px] font-medium text-ink">Status</span>
                <select
                  className="h-11 w-56 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as PurchaseOrderStatus | '')
                    setPage(1)
                  }}
                >
                  {STATUS_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </FilterToolbar>

            <div className="mt-4">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO number</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Order date</TableHead>
                      <TableHead>Expected date</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && <TableSkeleton rows={5} columns={7} />}
                    {!isLoading && orders.length === 0 && <TableEmpty columns={7} message="No purchase orders match these filters." />}
                    {orders.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/purchasing/${po.id}`)}
                            className="font-mono text-accent hover:text-accent-strong hover:underline"
                          >
                            {po.orderNumber}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{po.supplierName}</TableCell>
                        <TableCell className="whitespace-nowrap text-ink-muted">{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="whitespace-nowrap text-ink-muted">
                          {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{po.itemCount}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{formatPesewas(po.totalCost ?? 0)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <PurchaseOrderStatusPill status={po.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-2 md:hidden">
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[92px] animate-pulse rounded-lg border border-border bg-surface-raised" />)}
                {!isLoading && orders.length === 0 && (
                  <p className="rounded-lg border border-border bg-surface-raised p-6 text-center text-sm text-ink-muted">No purchase orders match these filters.</p>
                )}
                {orders.map((po) => (
                  <div
                    key={po.id}
                    onClick={() => navigate(`/purchasing/${po.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-raised p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-mono text-[13px] text-accent">{po.orderNumber}</span>
                        <PurchaseOrderStatusPill status={po.status} />
                      </div>
                      <p className="mt-0.5 truncate font-display text-[13px] text-ink">{po.supplierName}</p>
                      <p className="mt-0.5 font-display text-[12px] text-ink-faint">
                        Ordered {new Date(po.createdAt).toLocaleDateString()}
                        {po.expectedDate && ` · Expected ${new Date(po.expectedDate).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      <span className="font-mono text-sm font-semibold tabular-nums text-ink">{formatPesewas(po.totalCost ?? 0)}</span>
                      <span className="font-display text-[12px] text-ink-faint">{po.itemCount} item{po.itemCount === 1 ? '' : 's'}</span>
                    </div>
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
                  itemLabel="purchase orders"
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  onPageSizeChange={(size) => {
                    setPageSize(size)
                    setPage(1)
                  }}
                />
              )}
            </div>
          </div>

          <RestockSummaryPanel onCreate={openNewOrder} />
        </div>
      )}

      {tab === 'suppliers' && (
        <div className="mt-4">
          <SuppliersPanel />
        </div>
      )}

      {tab === 'restock' && (
        <div className="mt-4">
          <RestockTab onCreate={openNewOrder} />
        </div>
      )}

      {formOpen && (
        <PurchaseOrderFormDialog
          initial={formInitial ?? undefined}
          onClose={() => {
            setFormOpen(false)
            setFormInitial(null)
          }}
          onSuccess={handleCreated}
        />
      )}
    </PageContainer>
  )
}
