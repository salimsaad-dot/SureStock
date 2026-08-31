import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, DollarSign, Download, Package, Receipt, RotateCcw, ShoppingCart, TrendingUp, Truck, Wallet, XCircle } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { StatCard } from '../../components/StatCard'
import { getStaff } from '../../lib/api/auth'
import { listCategories } from '../../lib/api/catalogue'
import { exportReportsCsv, getPaymentBreakdown, getReportsOverview, getReportsTrend } from '../../lib/api/reports'
import type { PaymentMethod } from '../../lib/api/types'
import { triggerBrowserDownload } from '../../lib/download'
import { formatPesewas } from '../../lib/money'
import { useToast } from '../../lib/toast-store'
import { DateRangePicker } from './DateRangePicker'
import { formatRangeLabel, presetRange, priorPeriodRange } from './date-range'
import { PaymentMethodDonut } from './PaymentMethodDonut'
import { ReportsProductsTable } from './ReportsProductsTable'
import { SalesTrendChart } from './SalesTrendChart'
import { ShrinkageTab } from './ShrinkageTab'
import { StaffActivityTab } from './StaffActivityTab'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'shrinkage', label: 'Shrinkage' },
  { value: 'staff', label: 'Staff activity' },
] as const
type ReportsTab = (typeof TABS)[number]['value']

const METHOD_OPTIONS: { value: PaymentMethod | ''; label: string }[] = [
  { value: '', label: 'All methods' },
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile money' },
  { value: 'CARD', label: 'Card' },
  { value: 'ACCOUNT', label: 'Account' },
]

/** Doc 1 §3.4 / mockup: "Gain insights into your sales, inventory and business performance." Every figure here is computed live off the real ledger — no rollup job, no fabricated demo numbers. */
export function ReportsPage() {
  const show = useToast()
  const filtersRef = useRef<HTMLDetailsElement>(null)
  const [tab, setTab] = useState<ReportsTab>('overview')
  const [{ dateFrom, dateTo }, setRange] = useState(() => presetRange('7D'))
  const [userId, setUserId] = useState('')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [exporting, setExporting] = useState(false)

  const { data: staff } = useQuery({ queryKey: ['auth', 'staff'], queryFn: getStaff })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() })

  const filters = useMemo(
    () => ({ dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), userId: userId || undefined, method: method || undefined }),
    [dateFrom, dateTo, userId, method],
  )
  const priorRange = useMemo(() => priorPeriodRange(dateFrom, dateTo), [dateFrom, dateTo])
  const priorRangeLabel = `vs ${formatRangeLabel(priorRange.dateFrom, priorRange.dateTo)}`
  const hasActiveFilters = Boolean(userId || method)

  const { data: overview } = useQuery({ queryKey: ['reports', 'overview', filters], queryFn: () => getReportsOverview(filters) })
  const { data: trend } = useQuery({ queryKey: ['reports', 'trend', filters], queryFn: () => getReportsTrend(filters) })
  const { data: paymentBreakdown } = useQuery({ queryKey: ['reports', 'payment-breakdown', filters], queryFn: () => getPaymentBreakdown(filters) })

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportReportsCsv(filters)
      triggerBrowserDownload(blob, 'report.csv')
    } catch {
      show('Could not export the report.', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Reports</h1>
          <p className="mt-0.5 font-body text-sm text-ink-muted">Gain insights into your sales, inventory and business performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={({ dateFrom: f, dateTo: t }) => setRange({ dateFrom: f, dateTo: t })} />
          <details ref={filtersRef} className="relative inline-block">
            <summary
              className={`flex h-11 list-none items-center gap-2 rounded-md border px-3 font-display text-sm font-medium [&::-webkit-details-marker]:hidden ${
                hasActiveFilters ? 'border-accent text-accent-strong' : 'border-border-strong text-ink'
              }`}
            >
              Filters {hasActiveFilters && '•'}
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-border bg-surface-raised p-3 shadow-lg">
              <label className="flex flex-col gap-1.5">
                <span className="font-display text-[12.5px] font-medium text-ink">Staff</span>
                <select
                  className="h-10 rounded-md border border-border-strong bg-surface px-2 font-display text-sm text-ink"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">All staff</option>
                  {staff?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="font-display text-[12.5px] font-medium text-ink">Payment method</span>
                <select
                  className="h-10 rounded-md border border-border-strong bg-surface px-2 font-display text-sm text-ink"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod | '')}
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
                  onClick={() => {
                    setUserId('')
                    setMethod('')
                  }}
                  className="mt-3 font-display text-[12.5px] font-medium text-accent hover:text-accent-strong"
                >
                  Clear filters
                </button>
              )}
            </div>
          </details>
          <Button isLoading={exporting} onClick={handleExport}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export report
          </Button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={
              tab === t.value
                ? 'border-b-2 border-accent px-3 py-2 font-display text-sm font-semibold text-accent-strong'
                : 'border-b-2 border-transparent px-3 py-2 font-display text-sm text-ink-muted hover:text-ink'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'shrinkage' && (
        <div className="mt-4">
          <ShrinkageTab filters={filters} />
        </div>
      )}

      {tab === 'staff' && (
        <div className="mt-4">
          <StaffActivityTab filters={filters} />
        </div>
      )}

      {tab === 'overview' && (
      <>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          label="Total Sales"
          value={formatPesewas(overview?.totalSales ?? 0)}
          tone="accent"
          comparison={{ changePct: overview?.totalSalesChangePct ?? null, goodDirectionUp: true, rangeLabel: priorRangeLabel }}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
          label="Gross Profit"
          value={formatPesewas(overview?.grossProfit ?? 0)}
          tone="success"
          comparison={{ changePct: overview?.grossProfitChangePct ?? null, goodDirectionUp: true, rangeLabel: priorRangeLabel }}
        />
        <StatCard
          icon={<ShoppingCart className="h-5 w-5" aria-hidden="true" />}
          label="Transactions"
          value={overview?.transactionCount ?? 0}
          tone="accent"
          comparison={{ changePct: overview?.transactionCountChangePct ?? null, goodDirectionUp: true, rangeLabel: priorRangeLabel }}
        />
        <StatCard
          icon={<Receipt className="h-5 w-5" aria-hidden="true" />}
          label="Avg Order Value"
          value={formatPesewas(overview?.avgOrderValue ?? 0)}
          tone="neutral"
          comparison={{ changePct: overview?.avgOrderValueChangePct ?? null, goodDirectionUp: true, rangeLabel: priorRangeLabel }}
        />
        <StatCard
          icon={<RotateCcw className="h-5 w-5" aria-hidden="true" />}
          label="Refunds"
          value={formatPesewas(overview?.refundTotal ?? 0)}
          tone="danger"
          comparison={{ changePct: overview?.refundTotalChangePct ?? null, goodDirectionUp: false, rangeLabel: priorRangeLabel }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-raised p-4 lg:col-span-2">
          <h2 className="font-display text-sm font-semibold text-ink">Sales over time</h2>
          <div className="mt-2">
            <SalesTrendChart data={trend ?? []} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <h2 className="font-display text-sm font-semibold text-ink">Sales by payment method</h2>
          <div className="mt-2">
            <PaymentMethodDonut data={paymentBreakdown ?? []} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <label className="flex items-center gap-2">
          <span className="font-display text-[13px] text-ink-muted">Category</span>
          <select
            className="h-9 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-[13px] text-ink"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">All categories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportsProductsTable title="Top selling products" params={{ ...filters, direction: 'top', limit: 5, categoryId: categoryId || undefined }} />
        <ReportsProductsTable title="Low / slow moving products" params={{ ...filters, direction: 'low', limit: 5, categoryId: categoryId || undefined }} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={<XCircle className="h-5 w-5" aria-hidden="true" />} label="Out of stock" value={overview?.outOfStockCount ?? 0} sublabel="products" tone="danger" />
        <StatCard icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />} label="Low stock" value={overview?.lowStockCount ?? 0} sublabel="products" tone="warning" />
        <StatCard icon={<Package className="h-5 w-5" aria-hidden="true" />} label="Total products" value={overview?.totalProductCount ?? 0} sublabel="products" tone="neutral" />
        <StatCard icon={<DollarSign className="h-5 w-5" aria-hidden="true" />} label="Inventory value" value={formatPesewas(overview?.inventoryValue ?? 0)} sublabel="at cost" tone="accent" />
        <StatCard icon={<Truck className="h-5 w-5" aria-hidden="true" />} label="Total purchased" value={formatPesewas(overview?.totalPurchased ?? 0)} sublabel="this period" tone="neutral" />
      </div>
      </>
      )}
    </main>
  )
}
