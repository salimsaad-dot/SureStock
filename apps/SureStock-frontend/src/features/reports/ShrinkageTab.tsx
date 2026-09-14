import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, PackageX, Timer } from 'lucide-react'
import { StatCard } from '../../components/StatCard'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '../../components/Table'
import { getShrinkageReport } from '../../lib/api/reports'
import type { ReportsFilterParams } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'

/**
 * Doc 1 §3.4: "Losses to damage, expiry, and unexplained variance, by
 * period and by staff." "Unexplained variance" means a stock take
 * finding less stock than the ledger expects (a negative
 * STOCK_TAKE_ADJUSTMENT) — till cash variance is Staff Activity's own
 * metric instead, a deliberately separate figure (see reports.service.ts).
 */
export function ShrinkageTab({ filters }: { filters: ReportsFilterParams }) {
  const { data, isLoading } = useQuery({ queryKey: ['reports', 'shrinkage', filters], queryFn: () => getShrinkageReport(filters) })

  const damage = data?.byType.find((t) => t.type === 'DAMAGE')?.total ?? 0
  const expiry = data?.byType.find((t) => t.type === 'EXPIRY')?.total ?? 0
  const variance = data?.byType.find((t) => t.type === 'UNEXPLAINED_VARIANCE')?.total ?? 0

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<PackageX className="h-5 w-5" aria-hidden="true" />} label="Damage" value={formatPesewas(damage)} tone="danger" />
        <StatCard icon={<Timer className="h-5 w-5" aria-hidden="true" />} label="Expiry" value={formatPesewas(expiry)} tone="warning" />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          label="Unexplained variance"
          value={formatPesewas(variance)}
          sublabel="stock-take shortfalls"
          tone="danger"
        />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="flex-none font-display text-lg font-semibold text-ink">By staff member</h2>
          <p className="min-w-0 break-words font-mono text-sm font-semibold text-ink">Total: {formatPesewas(data?.totalLoss ?? 0)}</p>
        </div>
        <div className="mt-3 hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Damage</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Unexplained variance</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!isLoading && (data?.byStaff.length ?? 0) === 0 && <TableEmpty columns={5} message="No shrinkage recorded in this range." />}
              {(data?.byStaff ?? []).map((s) => (
                <TableRow key={s.userId}>
                  <TableCell>{s.userName}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatPesewas(s.damageTotal)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatPesewas(s.expiryTotal)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatPesewas(s.varianceTotal)}</TableCell>
                  <TableCell className="font-mono font-semibold tabular-nums">{formatPesewas(s.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-col gap-2 md:hidden">
          {!isLoading && (data?.byStaff.length ?? 0) === 0 && (
            <p className="rounded-lg border border-border bg-surface-sunken p-4 text-center text-sm text-ink-muted">No shrinkage recorded in this range.</p>
          )}
          {(data?.byStaff ?? []).map((s) => (
            <div key={s.userId} className="rounded-lg border border-border bg-surface-sunken p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-display text-sm font-medium text-ink">{s.userName}</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-ink">{formatPesewas(s.total)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-display text-[12.5px] text-ink-muted">
                <span>
                  Damage <span className="font-mono tabular-nums text-ink">{formatPesewas(s.damageTotal)}</span>
                </span>
                <span>
                  Expiry <span className="font-mono tabular-nums text-ink">{formatPesewas(s.expiryTotal)}</span>
                </span>
                <span>
                  Variance <span className="font-mono tabular-nums text-ink">{formatPesewas(s.varianceTotal)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
