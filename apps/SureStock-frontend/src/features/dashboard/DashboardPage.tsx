import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ClipboardCheck, ListChecks, PackageX, ScanEye, TrendingUp, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageContainer } from '../../components/PageContainer'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { getDashboard } from '../../lib/api/dashboard'
import { getOnboardingStatus } from '../../lib/api/onboarding'
import type { AttentionItemType } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'
import { formatPesewas } from '../../lib/money'
import { SalesTrendChart } from '../reports/SalesTrendChart'

const ATTENTION_ICON: Record<AttentionItemType, LucideIcon> = {
  OUT_OF_STOCK: PackageX,
  LOW_STOCK: AlertTriangle,
  TILL_VARIANCE: ScanEye,
  REVIEW_QUEUE: ClipboardCheck,
}

const ATTENTION_TONE: Record<AttentionItemType, string> = {
  OUT_OF_STOCK: 'bg-danger-wash text-danger',
  LOW_STOCK: 'bg-warning-wash text-warning',
  TILL_VARIANCE: 'bg-warning-wash text-warning',
  REVIEW_QUEUE: 'bg-accent-wash text-accent-strong',
}

/**
 * Doc 3 §6: "The owner lands on a dashboard, not the till... a set of
 * doorways, not a wall of numbers." Everything here is "today" plus a
 * 30-day trend, computed live (see dashboard.service.ts) — a distinct
 * lens from the Reports screen's arbitrary-range analysis.
 */
export function DashboardPage() {
  const role = useAuthStore((s) => s.session?.user.role)
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard })
  // Doc 3 §2/§6: "a progress checklist stays on the dashboard until it
  // is complete" — Owner-only, matching who onboarding.service.ts gates to.
  const { data: onboarding } = useQuery({ queryKey: ['onboarding', 'status'], queryFn: getOnboardingStatus, enabled: role === 'OWNER' })

  return (
    <PageContainer>
      <PageHeader title="Dashboard" subtitle="Today, compared with the same day last week." />

      {onboarding && !onboarding.isComplete && (
        <Link
          to="/onboarding"
          className="mt-4 flex items-center gap-3 rounded-lg border border-accent bg-accent-wash p-4 transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken"
        >
          <ListChecks className="h-5 w-5 flex-none text-accent-strong" aria-hidden="true" />
          <span className="flex-1 font-display text-sm text-accent-strong">
            {onboarding.steps.find((s) => s.required && !s.done)?.label ?? 'Finish setting up your shop'}
          </span>
          <span className="font-display text-[13px] font-medium text-accent-strong">Continue →</span>
        </Link>
      )}

      {/* Revenue and Gross profit are this shop's two headline figures — given
          a wider, more prominent row than the operational stats below them. */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          label="Revenue today"
          value={formatPesewas(data?.todayRevenue ?? 0)}
          tone="accent"
          comparison={{ changePct: data?.todayRevenueChangePct ?? null, goodDirectionUp: true, rangeLabel: 'vs last week' }}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
          label="Gross profit"
          value={formatPesewas(data?.todayGrossProfit ?? 0)}
          tone="success"
          comparison={{ changePct: data?.todayGrossProfitChangePct ?? null, goodDirectionUp: true, rangeLabel: 'vs last week' }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard
          icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
          label="Transactions"
          value={data?.todayTransactions ?? 0}
          tone="neutral"
          comparison={{ changePct: data?.todayTransactionsChangePct ?? null, goodDirectionUp: true, rangeLabel: 'vs last week' }}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          label="Cash in drawer"
          value={formatPesewas(data?.cashInDrawer ?? 0)}
          sublabel="across every open till"
          tone="neutral"
        />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-raised p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Revenue, last 30 days</h2>
        <div className="mt-3">
          <SalesTrendChart data={data?.trend ?? []} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <h2 className="font-display text-lg font-semibold text-ink">Needs attention</h2>
          <div className="mt-3 flex flex-col gap-2">
            {data && data.attention.length === 0 && <p className="font-display text-sm text-ink-muted">Nothing needs attention right now.</p>}
            {data?.attention.map((item) => {
              const Icon = ATTENTION_ICON[item.type]
              return (
                <Link
                  key={item.type}
                  to={item.linkPath}
                  className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken"
                >
                  <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${ATTENTION_TONE[item.type]}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-sm text-ink">{item.label}</span>
                  <span className="flex-none font-display text-[13px] font-medium text-accent">View →</span>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <h2 className="font-display text-lg font-semibold text-ink">Today's top sellers</h2>
          <div className="mt-3 flex flex-col gap-2">
            {data && data.topSellers.length === 0 && <p className="font-display text-sm text-ink-muted">No sales yet today.</p>}
            {data?.topSellers.map((p) => (
              <div key={p.variantId} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-medium text-ink">{p.productName}</p>
                  <p className="font-mono text-[11px] text-ink-faint">{p.sku}</p>
                </div>
                <div className="flex-none text-right">
                  <p className="font-mono text-sm font-semibold tabular-nums text-ink">{formatPesewas(p.revenue)}</p>
                  <p className="font-display text-[11px] text-ink-faint">{p.qtySold} sold</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
