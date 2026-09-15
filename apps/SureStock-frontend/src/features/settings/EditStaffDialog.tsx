import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { updateStaff } from '../../lib/api/settings'
import { ApiError, type StaffAdmin } from '../../lib/api/types'

/** Fills a real gap: role/status already had inline controls in the table, but name/email/phone (including the login identifier itself) had no edit path anywhere in the UI, even though PATCH /settings/users/:id already supported it. */
export function EditStaffDialog({
  staff,
  onClose,
  onSuccess,
}: {
  staff: StaffAdmin
  onClose: () => void
  onSuccess: (staff: StaffAdmin) => void
}) {
  const [name, setName] = useState(staff.name)
  const [email, setEmail] = useState(staff.email ?? '')
  const [phone, setPhone] = useState(staff.phone ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      updateStaff(staff.id, {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      }),
    onSuccess,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function submit() {
    setFormError(null)
    if (!name.trim()) return setFormError('Enter a name.')
    if (!email.trim() && !phone.trim()) return setFormError('Enter an email or a phone number.')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Edit {staff.name}</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextInput label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button className="mt-6 w-full" isLoading={mutation.isPending} onClick={submit}>
          Save
        </Button>
      </div>
    </div>
  )
}
