import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { ApiError } from '../../lib/api/types'
import type { SettingsTabProps } from './settings-tab-props'

/** Doc 3/mockup Security tab — PIN lockout policy, real per-location settings now (was a hardcoded constant in auth/service.ts). */
export function SecurityTab({ settings, onSave, saving }: SettingsTabProps) {
  const [attempts, setAttempts] = useState(String(settings.pinLockoutAttempts))
  const [minutes, setMinutes] = useState(String(settings.pinLockoutMinutes))
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const attemptsNum = Number(attempts)
    const minutesNum = Number(minutes)
    if (!Number.isInteger(attemptsNum) || attemptsNum < 1 || attemptsNum > 20) {
      setError('Attempts must be a whole number between 1 and 20.')
      return
    }
    if (!Number.isInteger(minutesNum) || minutesNum < 1 || minutesNum > 120) {
      setError('Lockout duration must be a whole number of minutes between 1 and 120.')
      return
    }
    try {
      await onSave({ pinLockoutAttempts: attemptsNum, pinLockoutMinutes: minutesNum })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="font-display text-lg font-semibold text-ink">Security</h2>
      <p className="mt-0.5 font-display text-[13px] text-ink-muted">PIN lockout policy for staff quick-switch.</p>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <TextInput label="Failed attempts before lockout" inputMode="numeric" value={attempts} onChange={(e) => setAttempts(e.target.value)} />
          <p className="mt-1 font-display text-[12.5px] text-ink-muted">How many wrong PINs in a row lock the account.</p>
        </div>
        <div>
          <TextInput label="Lockout duration (minutes)" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <p className="mt-1 font-display text-[12.5px] text-ink-muted">How long a locked account stays locked before it can try again.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 font-display text-[13px] text-danger">
          {error}
        </p>
      )}

      <Button className="mt-6" isLoading={saving} onClick={submit}>
        Save changes
      </Button>
    </div>
  )
}
