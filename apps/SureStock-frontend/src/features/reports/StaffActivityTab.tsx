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
      <h2 className="font-display text-lg font-semibold text-ink">Staff activity</h2>
      <div className="mt-3 hidden md:block">
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
                <TableCell className="whitespace-nowrap font-medium text-ink">{r.userName}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-[11.5px] uppercase text-ink-faint">{r.role}</TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">{r.salesCount}</TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">{formatPesewas(r.salesTotal)}</TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">{formatPesewas(r.discountsTotal)}</TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">{r.refundsCount}</TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">{formatPesewas(r.refundsTotal)}</TableCell>
                <TableCell className="whitespace-nowrap font-mono tabular-nums">{r.shiftCount}</TableCell>
                <TableCell
                  className={cn(
                    'whitespace-nowrap font-mono tabular-nums',
                    r.totalVariance < 0 ? 'text-danger' : r.totalVariance > 0 ? 'text-success' : undefined,
                  )}
                >
                  {formatPesewas(r.totalVariance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:hidden">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[132px] animate-pulse rounded-lg border border-border bg-surface-sunken" />)}
        {!isLoading && rows.length === 0 && (
          <p className="rounded-lg border border-border bg-surface-sunken p-4 text-center text-sm text-ink-muted">No staff activity in this range.</p>
        )}
        {rows.map((r) => (
          <div key={r.userId} className="rounded-lg border border-border bg-surface-sunken p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-display text-sm font-medium text-ink">{r.userName}</span>
              <span className="font-mono text-[11px] uppercase text-ink-faint">{r.role}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-2 font-display text-[12.5px] text-ink-faint">
              <div className="flex justify-between gap-2">
                <span>Sales</span>
                <span className="font-mono tabular-nums text-ink">
                  {r.salesCount} · {formatPesewas(r.salesTotal)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Discounts</span>
                <span className="font-mono tabular-nums text-ink">{formatPesewas(r.discountsTotal)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Refunds</span>
                <span className="font-mono tabular-nums text-ink">
                  {r.refundsCount} · {formatPesewas(r.refundsTotal)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Till shifts</span>
                <span className="font-mono tabular-nums text-ink">{r.shiftCount}</span>
              </div>
            </div>
            <div className="mt-1.5 flex justify-between gap-2 border-t border-border pt-1.5 font-display text-[12.5px] text-ink-faint">
              <span>Till variance</span>
              <span
                className={cn('font-mono tabular-nums', r.totalVariance < 0 ? 'text-danger' : r.totalVariance > 0 ? 'text-success' : 'text-ink')}
              >
                {formatPesewas(r.totalVariance)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
