import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { listStaffAdmin, updateStaff } from '../../lib/api/settings'
import type { StaffAdmin, UserRole } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'
import { useToast } from '../../lib/toast-store'
import { ResetCredentialsDialog } from './ResetCredentialsDialog'
import { StaffFormDialog } from './StaffFormDialog'

const ROLES: UserRole[] = ['CASHIER', 'MANAGER', 'OWNER']

/** Doc 3/mockup Users & Roles tab. Owner-only, matching Settings' own route gate — deactivation already existed at the auth layer (T-03); this is the admin CRUD around it that never had a UI. */
export function UsersRolesTab() {
  const queryClient = useQueryClient()
  const show = useToast()
  const currentUserId = useAuthStore((s) => s.session?.user.id)
  const [addOpen, setAddOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<StaffAdmin | null>(null)

  const { data: staff, isLoading } = useQuery({ queryKey: ['settings', 'users'], queryFn: listStaffAdmin })

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ role: UserRole; isActive: boolean }> }) => updateStaff(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'users'] }),
  })

  function handleAdded() {
    setAddOpen(false)
    queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    show('Staff member added.')
  }

  function handleReset() {
    setResetTarget(null)
    show('Credentials reset.')
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Users & Roles</h2>
          <p className="mt-0.5 font-display text-[13px] text-ink-muted">Manage staff accounts, roles, and access.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add staff
        </Button>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={4} columns={6} />}
            {!isLoading && staff?.length === 0 && <TableEmpty columns={6} message="No staff yet." />}
            {staff?.map((s) => {
              const isSelf = s.id === currentUserId
              return (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell className="text-ink-muted">{s.email ?? s.phone ?? '—'}</TableCell>
                  <TableCell>
                    <select
                      className="h-9 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-[13px] text-ink disabled:opacity-50"
                      value={s.role}
                      disabled={isSelf}
                      onChange={(e) => patch.mutate({ id: s.id, body: { role: e.target.value as UserRole } })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>{s.isActive ? <Pill variant="success">Active</Pill> : <Pill variant="warning">Deactivated</Pill>}</TableCell>
                  <TableCell className="text-ink-muted">{s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : 'Never'}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setResetTarget(s)}
                        className="text-ink-faint hover:text-accent"
                        aria-label={`Reset credentials for ${s.name}`}
                      >
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <Button
                        size="default"
                        variant="secondary"
                        disabled={isSelf}
                        isLoading={patch.isPending}
                        onClick={() => patch.mutate({ id: s.id, body: { isActive: !s.isActive } })}
                      >
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {addOpen && <StaffFormDialog onClose={() => setAddOpen(false)} onSuccess={handleAdded} />}
      {resetTarget && <ResetCredentialsDialog staff={resetTarget} onClose={() => setResetTarget(null)} onSuccess={handleReset} />}
    </div>
  )
}
