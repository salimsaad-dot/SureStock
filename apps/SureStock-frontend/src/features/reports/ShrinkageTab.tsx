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
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">By staff member</h2>
          <p className="font-mono text-sm font-semibold text-ink">Total: {formatPesewas(data?.totalLoss ?? 0)}</p>
        </div>
        <div className="mt-3">
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
      </div>
    </div>
  )
}
