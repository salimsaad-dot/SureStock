import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Pagination } from '../../components/Pagination'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { listAuditLog } from '../../lib/api/audit-log'
import { getStaff } from '../../lib/api/auth'

const ACTION_LABEL: Record<string, string> = {
  STOCK_ADJUSTMENT: 'Stock adjustment',
  DISCOUNT_OVERRIDE: 'Discount override',
  TILL_VARIANCE_ALERT: 'Till variance alert',
  PIN_LOCKOUT: 'PIN lockout',
  STOCK_TAKE_POSTED: 'Stock take posted',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Doc 6 T-31: "the audit log is searchable by user, action, and date." Doc 1: "an activity log covering every sensitive action." Owner-only. */
export function ActivityLogTab() {
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const { data: staff } = useQuery({ queryKey: ['auth', 'staff'], queryFn: getStaff })
  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', { userId, action, dateFrom, dateTo, page }],
    queryFn: () =>
      listAuditLog({
        userId: userId || undefined,
        action: action || undefined,
        dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
        page,
      }),
  })

  const items = data?.items ?? []

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">Activity log</h2>
      <p className="mt-0.5 font-display text-[13px] text-ink-muted">Every sensitive action in your shop, who did it, and when.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[12.5px] font-medium text-ink">Staff</span>
          <select
            className="h-10 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-sm text-ink"
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
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[12.5px] font-medium text-ink">Action</span>
          <select
            className="h-10 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-sm text-ink"
            value={action}
            onChange={(e) => {
              setAction(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All actions</option>
            {data?.availableActions.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a] ?? a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[12.5px] font-medium text-ink">From</span>
          <input
            type="date"
            className="h-10 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-sm text-ink"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[12.5px] font-medium text-ink">To</span>
          <input
            type="date"
            className="h-10 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-sm text-ink"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </label>
        {(userId || action || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setUserId('')
              setAction('')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
            className="h-10 font-display text-[13px] font-medium text-accent hover:text-accent-strong"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={5} columns={4} />}
            {!isLoading && items.length === 0 && <TableEmpty columns={4} message="No activity matches these filters." />}
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-ink-muted">{formatDate(item.createdAt)}</TableCell>
                <TableCell>{item.userName ?? '—'}</TableCell>
                <TableCell>{ACTION_LABEL[item.action] ?? item.action}</TableCell>
                <TableCell className="font-mono text-[12px] text-ink-faint">
                  {item.entityType} · {item.entityId.slice(-8)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data && data.totalCount > 0 && (
          <Pagination page={data.page} pageSize={data.pageSize} totalCount={data.totalCount} totalPages={data.totalPages} onPageChange={setPage} itemLabel="entries" />
        )}
      </div>
    </div>
  )
}
