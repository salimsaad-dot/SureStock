import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { createStaff } from '../../lib/api/settings'
import { ApiError, type StaffAdmin, type UserRole } from '../../lib/api/types'

const ROLES: UserRole[] = ['CASHIER', 'MANAGER', 'OWNER']

/** Doc 3/mockup Users & Roles "Add staff" — no invite/reset-link flow exists (no email/SMS system), so the owner sets the initial password (and optionally PIN) directly. */
export function StaffFormDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: (staff: StaffAdmin) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<UserRole>('CASHIER')
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      createStaff({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
        pin: pin || undefined,
        role,
      }),
    onSuccess,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) return setFormError('Enter a name.')
    if (!email.trim() && !phone.trim()) return setFormError('Enter an email or a phone number.')
    if (password.length < 8) return setFormError('Password must be at least 8 characters.')
    if (pin && !/^\d{4}$/.test(pin)) return setFormError('PIN must be exactly 4 digits.')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Add staff</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextInput label="PIN (optional, 4 digits)" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} />
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Role</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button className="mt-6 w-full" isLoading={mutation.isPending} onClick={submit}>
          Add staff
        </Button>
      </div>
    </div>
  )
}
