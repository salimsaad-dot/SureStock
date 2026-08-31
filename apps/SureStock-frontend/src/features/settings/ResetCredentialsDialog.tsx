import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { resetStaffCredentials } from '../../lib/api/settings'
import { ApiError, type StaffAdmin } from '../../lib/api/types'

/** Doc 3/mockup Users & Roles reset action — no email/SMS reset-link flow exists, so the owner sets the new password/PIN directly. */
export function ResetCredentialsDialog({
  staff,
  onClose,
  onSuccess,
}: {
  staff: StaffAdmin
  onClose: () => void
  onSuccess: (staff: StaffAdmin) => void
}) {
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => resetStaffCredentials(staff.id, { password: password || undefined, pin: pin || undefined }),
    onSuccess,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function submit() {
    setFormError(null)
    if (!password && !pin) return setFormError('Enter a new password and/or PIN.')
    if (password && password.length < 8) return setFormError('Password must be at least 8 characters.')
    if (pin && !/^\d{4}$/.test(pin)) return setFormError('PIN must be exactly 4 digits.')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Reset credentials for {staff.name}</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <TextInput label="New password (optional)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextInput label="New PIN (optional, 4 digits)" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} />
        </div>

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button className="mt-6 w-full" isLoading={mutation.isPending} onClick={submit}>
          Reset
        </Button>
      </div>
    </div>
  )
}
