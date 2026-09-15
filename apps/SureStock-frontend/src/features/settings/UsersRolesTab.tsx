import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Clock, KeyRound, Mail, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { Pill } from '../../components/Pill'
import { UserAvatar } from '../../components/UserAvatar'
import { listStaffAdmin, updateStaff } from '../../lib/api/settings'
import type { StaffAdmin, UserRole } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'
import { useToast } from '../../lib/toast-store'
import { EditStaffDialog } from './EditStaffDialog'
import { ResetCredentialsDialog } from './ResetCredentialsDialog'
import { StaffFormDialog } from './StaffFormDialog'

const ROLES: UserRole[] = ['CASHIER', 'MANAGER', 'OWNER']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Doc 3/mockup Users & Roles tab. Owner-only, matching Settings' own route gate — deactivation already existed at the auth layer (T-03); this is the admin CRUD around it that never had a UI. */
export function UsersRolesTab() {
  const queryClient = useQueryClient()
  const show = useToast()
  const currentUserId = useAuthStore((s) => s.session?.user.id)
  const [addOpen, setAddOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<StaffAdmin | null>(null)
  const [editTarget, setEditTarget] = useState<StaffAdmin | null>(null)

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

  function handleEdited() {
    setEditTarget(null)
    queryClient.invalidateQueries({ queryKey: ['settings', 'users'] })
    show('Staff details updated.')
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

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isLoading &&
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[168px] animate-pulse rounded-xl border border-border bg-surface-raised" />)}
        {!isLoading && staff?.length === 0 && (
          <p className="col-span-full rounded-xl border border-border bg-surface-raised p-6 text-center text-sm text-ink-muted">No staff yet.</p>
        )}
        {staff?.map((s) => {
          const isSelf = s.id === currentUserId
          return (
            <div key={s.id} className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <UserAvatar name={s.name} avatarUrl={s.avatarUrl} />
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold text-ink">{s.name}</p>
                    <select
                      className="mt-1 h-6 rounded-full border border-border-strong bg-surface-sunken px-2 font-display text-[11px] font-medium text-ink-muted disabled:opacity-50"
                      value={s.role}
                      disabled={isSelf}
                      onChange={(e) => patch.mutate({ id: s.id, body: { role: e.target.value as UserRole } })}
                      aria-label={`Role for ${s.name}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-1">
                  <button type="button" onClick={() => setEditTarget(s)} className="text-ink-faint hover:text-accent" aria-label={`Edit ${s.name}`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetTarget(s)}
                    className="text-ink-faint hover:text-accent"
                    aria-label={`Reset credentials for ${s.name}`}
                  >
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-1.5 font-display text-[13px] text-ink-muted">
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                  <span className="truncate">{s.email ?? s.phone ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                  <span>{s.lastLoginAt ? `Last login ${formatDate(s.lastLoginAt)}` : 'Never logged in'}</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-1.5 font-display text-[12px] text-ink-faint">
                  <Calendar className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
                  Joined {formatDate(s.createdAt)}
                </div>
                <div className="flex items-center gap-2">
                  {s.isActive ? <Pill variant="success">Active</Pill> : <Pill variant="warning">Deactivated</Pill>}
                  <Button
                    size="default"
                    variant="secondary"
                    className="flex-none"
                    disabled={isSelf}
                    isLoading={patch.isPending}
                    onClick={() => patch.mutate({ id: s.id, body: { isActive: !s.isActive } })}
                  >
                    {s.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {addOpen && <StaffFormDialog onClose={() => setAddOpen(false)} onSuccess={handleAdded} />}
      {resetTarget && <ResetCredentialsDialog staff={resetTarget} onClose={() => setResetTarget(null)} onSuccess={handleReset} />}
      {editTarget && <EditStaffDialog staff={editTarget} onClose={() => setEditTarget(null)} onSuccess={handleEdited} />}
    </div>
  )
}
