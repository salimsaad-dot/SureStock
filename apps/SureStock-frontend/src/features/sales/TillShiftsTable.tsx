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
              <TableCell className="text-ink-muted">{new Date(shift.openedAt).toLocaleString()}</TableCell>
              <TableCell className="text-ink-muted">{shift.closedAt ? new Date(shift.closedAt).toLocaleString() : '—'}</TableCell>
              <TableCell>{shift.userName}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatPesewas(shift.openingFloat)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{shift.expectedCash !== null ? formatPesewas(shift.expectedCash) : '—'}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{shift.countedCash !== null ? formatPesewas(shift.countedCash) : '—'}</TableCell>
              <TableCell className={`text-right font-mono tabular-nums ${shift.variance && shift.variance !== 0 ? 'text-danger' : 'text-ink-muted'}`}>
                {shift.variance !== null ? formatPesewas(shift.variance) : '—'}
              </TableCell>
              <TableCell>{shift.status === 'OPEN' ? <Pill variant="success">Open</Pill> : <Pill variant="warning">Closed</Pill>}</TableCell>
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
