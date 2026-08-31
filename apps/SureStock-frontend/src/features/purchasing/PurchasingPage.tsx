import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, FileText, PackageCheck, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Pagination } from '../../components/Pagination'
import { StatCard } from '../../components/StatCard'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
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
    <main className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Purchasing</h1>
          <p className="mt-0.5 font-body text-sm text-ink-muted">Manage purchase orders, suppliers and restock recommendations.</p>
        </div>
        <Button onClick={() => openNewOrder()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New purchase order
        </Button>
      </div>

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

      <div className="mt-6 flex gap-1 border-b border-border">
        {(['orders', 'suppliers', 'restock'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 font-display text-sm font-medium ${
              tab === t ? 'border-b-2 border-accent text-accent-strong' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t === 'orders' ? 'Purchase orders' : t === 'suppliers' ? 'Suppliers' : 'Restock'}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div>
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

            <div className="mt-4">
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
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => navigate(`/purchasing/${po.id}`)}
                          className="font-mono text-accent hover:text-accent-strong hover:underline"
                        >
                          {po.orderNumber}
                        </button>
                      </TableCell>
                      <TableCell>{po.supplierName}</TableCell>
                      <TableCell className="text-ink-muted">{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-ink-muted">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{po.itemCount}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatPesewas(po.totalCost ?? 0)}</TableCell>
                      <TableCell>
                        <PurchaseOrderStatusPill status={po.status} />
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
    </main>
  )
}
