import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, Download, RotateCcw, ShoppingCart, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Pagination } from '../../components/Pagination'
import { StatCard } from '../../components/StatCard'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { TextInput } from '../../components/TextInput'
import { getStaff } from '../../lib/api/auth'
import { exportSalesCsv, getSale, getSalesStats, listSales } from '../../lib/api/sales'
import type { PaymentMethod, Sale } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'
import { triggerBrowserDownload } from '../../lib/download'
import { formatPesewas } from '../../lib/money'
import { useToast } from '../../lib/toast-store'
import { RefundDialog } from './RefundDialog'
import { SaleActionsMenu } from './SaleActionsMenu'
import { SaleStatusPill } from './SaleStatusPill'
import { TillShiftsTable } from './TillShiftsTable'

const METHOD_OPTIONS: { value: PaymentMethod | ''; label: string }[] = [
  { value: '', label: 'All methods' },
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile money' },
  { value: 'CARD', label: 'Card' },
  { value: 'ACCOUNT', label: 'Account' },
]

const PAGE_SIZE_OPTIONS = [10, 20, 50]

function StaffAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-wash font-display text-[11px] font-semibold text-accent-strong">
      {initials}
    </span>
  )
}

/** Doc 3 App Flow §5: "Sales — transaction history, refunds, till shifts." */
export function SalesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const show = useToast()
  const role = useAuthStore((s) => s.session?.user.role)
  const canFilterByStaff = role === 'OWNER' || role === 'MANAGER'

  const [tab, setTab] = useState<'transactions' | 'till-shifts'>('transactions')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [userId, setUserId] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [refundTargetId, setRefundTargetId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const { data: staff } = useQuery({ queryKey: ['auth', 'staff'], queryFn: getStaff, enabled: canFilterByStaff })

  const scopedUserId = (canFilterByStaff && userId) || undefined
  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, userId: scopedUserId, method: method || undefined }
  const hasActiveFilters = Boolean(dateFrom || dateTo || userId || method)

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setUserId('')
    setMethod('')
    setPage(1)
  }

  const { data: stats } = useQuery({ queryKey: ['sales', 'stats', filters], queryFn: () => getSalesStats(filters) })
  const { data, isLoading } = useQuery({
    queryKey: ['sales', filters, page, pageSize],
    queryFn: () => listSales({ ...filters, page, pageSize }),
    enabled: tab === 'transactions',
  })
  const { data: refundTargetSale } = useQuery({
    queryKey: ['sale', refundTargetId],
    queryFn: () => getSale(refundTargetId!),
    enabled: refundTargetId !== null,
  })

  const trends = useMemo(() => {
    const daily = stats?.dailyTrend ?? []
    return {
      totalSales: daily.map((d) => d.totalSales),
      transactionCount: daily.map((d) => d.transactionCount),
      completedCount: daily.map((d) => d.completedCount),
      refundedCount: daily.map((d) => d.refundedCount),
    }
  }, [stats])

  function handleRefundSuccess(refund: Sale) {
    setRefundTargetId(null)
    queryClient.invalidateQueries({ queryKey: ['sales'] })
    show('Refund complete.')
    navigate(`/sales/${refund.id}`)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportSalesCsv(filters)
      triggerBrowserDownload(blob, 'sales-export.csv')
    } catch {
      show('Could not export sales.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const sales = data?.items ?? []

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Sales</h1>
          <p className="mt-0.5 font-body text-sm text-ink-muted">
            {canFilterByStaff ? 'Track transactions, payments, refunds and till shifts.' : 'Your transaction history.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setTab('till-shifts')}>
            <Clock className="h-4 w-4" aria-hidden="true" /> Till shifts
          </Button>
          <Button isLoading={exporting} onClick={handleExport}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export report
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          label="Total Sales"
          value={formatPesewas(stats?.totalSales ?? 0)}
          sublabel="This period"
          tone="accent"
          trend={trends.totalSales}
        />
        <StatCard
          icon={<ShoppingCart className="h-5 w-5" aria-hidden="true" />}
          label="Transactions"
          value={stats?.transactionCount ?? 0}
          sublabel="This period"
          tone="accent"
          trend={trends.transactionCount}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          label="Completed"
          value={stats?.completedCount ?? 0}
          sublabel="This period"
          tone="success"
          trend={trends.completedCount}
        />
        <StatCard
          icon={<RotateCcw className="h-5 w-5" aria-hidden="true" />}
          label="Refunded"
          value={stats?.refundedCount ?? 0}
          sublabel="This period"
          tone="danger"
          trend={trends.refundedCount}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <TextInput
            type="date"
            label="From"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <div className="w-40">
          <TextInput
            type="date"
            label="To"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
        {canFilterByStaff && (
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Staff</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All staff</option>
              {staff?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[13px] font-medium text-ink">Payment method</span>
          <select
            className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as PaymentMethod | '')
              setPage(1)
            }}
          >
            {METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="h-11 font-display text-[13px] font-medium text-accent hover:text-accent-strong"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('transactions')}
          className={`px-4 py-2.5 font-display text-sm font-medium ${
            tab === 'transactions' ? 'border-b-2 border-accent text-accent-strong' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Transactions
        </button>
        <button
          type="button"
          onClick={() => setTab('till-shifts')}
          className={`px-4 py-2.5 font-display text-sm font-medium ${
            tab === 'till-shifts' ? 'border-b-2 border-accent text-accent-strong' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Till shifts
        </button>
      </div>

      {tab === 'transactions' ? (
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                {canFilterByStaff && <TableHead>Staff</TableHead>}
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton rows={6} columns={canFilterByStaff ? 7 : 6} />}
              {!isLoading && sales.length === 0 && (
                <TableEmpty columns={canFilterByStaff ? 7 : 6} message="No sales match these filters." />
              )}
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => navigate(`/sales/${sale.id}`)}
                      className="font-mono text-accent hover:text-accent-strong hover:underline"
                    >
                      {sale.receiptNumber}
                    </button>
                  </TableCell>
                  <TableCell className="text-ink-muted">{new Date(sale.soldAt).toLocaleString()}</TableCell>
                  {canFilterByStaff && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StaffAvatar name={sale.userName} />
                        {sale.userName}
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-ink-muted">{sale.paymentMethods.map((m) => m.replace('_', ' ')).join(', ')}</TableCell>
                  <TableCell>
                    <SaleStatusPill status={sale.status} isRefund={sale.refundOfSaleId !== null} />
                  </TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${sale.total < 0 ? 'text-danger' : 'text-ink'}`}>
                    {sale.total < 0 && '− '}
                    {formatPesewas(Math.abs(sale.total))}
                  </TableCell>
                  <TableCell>
                    <SaleActionsMenu sale={sale} onRefund={setRefundTargetId} />
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
              itemLabel="transactions"
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          )}
        </div>
      ) : (
        <div className="mt-4">
          <TillShiftsTable dateFrom={filters.dateFrom} dateTo={filters.dateTo} userId={scopedUserId} />
        </div>
      )}

      {refundTargetSale && (
        <RefundDialog sale={refundTargetSale} onClose={() => setRefundTargetId(null)} onSuccess={handleRefundSuccess} />
      )}
    </main>
  )
}
