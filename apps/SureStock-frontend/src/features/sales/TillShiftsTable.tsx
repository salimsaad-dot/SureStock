import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Pagination } from '../../components/Pagination'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { listTillShifts } from '../../lib/api/sales'
import { formatPesewas } from '../../lib/money'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

/** Doc 3 App Flow §5: the Sales screen's "Till shifts" tab — a shift's own history, separate from the transactions it produced. */
export function TillShiftsTable({ dateFrom, dateTo, userId }: { dateFrom?: string; dateTo?: string; userId?: string }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filters = { dateFrom, dateTo, userId }
  const { data, isLoading } = useQuery({
    queryKey: ['till-shifts', filters, page, pageSize],
    queryFn: () => listTillShifts({ ...filters, page, pageSize }),
  })

  const shifts = data?.items ?? []

  return (
    <div>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead className="text-right">Opening float</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={6} columns={8} />}
            {!isLoading && shifts.length === 0 && <TableEmpty columns={8} message="No till shifts match these filters." />}
            {shifts.map((shift) => (
              <TableRow key={shift.id}>
                <TableCell className="whitespace-nowrap text-ink-muted">{new Date(shift.openedAt).toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap text-ink-muted">{shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{shift.userName}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">{formatPesewas(shift.openingFloat)}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                  {shift.expectedCash !== null ? formatPesewas(shift.expectedCash) : '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                  {shift.countedCash !== null ? formatPesewas(shift.countedCash) : '—'}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap text-right font-mono tabular-nums ${shift.variance && shift.variance !== 0 ? 'text-danger' : 'text-ink-muted'}`}
                >
                  {shift.variance !== null ? formatPesewas(shift.variance) : '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {shift.status === 'OPEN' ? <Pill variant="success">Open</Pill> : <Pill variant="warning">Closed</Pill>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[124px] animate-pulse rounded-lg border border-border bg-surface-raised" />)}
        {!isLoading && shifts.length === 0 && (
          <p className="rounded-lg border border-border bg-surface-raised p-6 text-center text-sm text-ink-muted">No till shifts match these filters.</p>
        )}
        {shifts.map((shift) => (
          <div key={shift.id} className="rounded-lg border border-border bg-surface-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-display text-sm font-medium text-ink">{shift.userName}</span>
              {shift.status === 'OPEN' ? <Pill variant="success">Open</Pill> : <Pill variant="warning">Closed</Pill>}
            </div>
            <p className="mt-0.5 font-display text-[12px] text-ink-faint">
              {new Date(shift.openedAt).toLocaleString()}
              {shift.closedAt && ` – ${new Date(shift.closedAt).toLocaleString()}`}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-2 font-display text-[13px]">
              <div className="flex justify-between gap-2">
                <span className="text-ink-faint">Opening float</span>
                <span className="font-mono tabular-nums text-ink">{formatPesewas(shift.openingFloat)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-faint">Expected</span>
                <span className="font-mono tabular-nums text-ink">{shift.expectedCash !== null ? formatPesewas(shift.expectedCash) : '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-faint">Counted</span>
                <span className="font-mono tabular-nums text-ink">{shift.countedCash !== null ? formatPesewas(shift.countedCash) : '—'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-faint">Variance</span>
                <span className={`font-mono tabular-nums ${shift.variance && shift.variance !== 0 ? 'text-danger' : 'text-ink'}`}>
                  {shift.variance !== null ? formatPesewas(shift.variance) : '—'}
                </span>
              </div>
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
          itemLabel="till shifts"
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}
