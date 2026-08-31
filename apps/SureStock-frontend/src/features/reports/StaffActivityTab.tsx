import { useQuery } from '@tanstack/react-query'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { getStaffActivity } from '../../lib/api/reports'
import type { ReportsFilterParams } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'
import { cn } from '../../lib/cn'

/** Doc 1 §3.4: "Sales per cashier, discounts given, refunds processed, till variances." One row per staff member with any activity in range — a staff member who didn't work this period simply isn't listed. */
export function StaffActivityTab({ filters }: { filters: ReportsFilterParams }) {
  const { data, isLoading } = useQuery({ queryKey: ['reports', 'staff-activity', filters], queryFn: () => getStaffActivity(filters) })
  const rows = data ?? []

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <h2 className="font-display text-sm font-semibold text-ink">Staff activity</h2>
      <div className="mt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Sales total</TableHead>
              <TableHead>Discounts given</TableHead>
              <TableHead>Refunds processed</TableHead>
              <TableHead>Refunds total</TableHead>
              <TableHead>Till shifts</TableHead>
              <TableHead>Till variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={4} columns={9} />}
            {!isLoading && rows.length === 0 && <TableEmpty columns={9} message="No staff activity in this range." />}
            {rows.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="font-medium text-ink">{r.userName}</TableCell>
                <TableCell className="font-mono text-[11.5px] uppercase text-ink-faint">{r.role}</TableCell>
                <TableCell className="font-mono tabular-nums">{r.salesCount}</TableCell>
                <TableCell className="font-mono tabular-nums">{formatPesewas(r.salesTotal)}</TableCell>
                <TableCell className="font-mono tabular-nums">{formatPesewas(r.discountsTotal)}</TableCell>
                <TableCell className="font-mono tabular-nums">{r.refundsCount}</TableCell>
                <TableCell className="font-mono tabular-nums">{formatPesewas(r.refundsTotal)}</TableCell>
                <TableCell className="font-mono tabular-nums">{r.shiftCount}</TableCell>
                <TableCell className={cn('font-mono tabular-nums', r.totalVariance < 0 ? 'text-danger' : r.totalVariance > 0 ? 'text-success' : undefined)}>
                  {formatPesewas(r.totalVariance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
