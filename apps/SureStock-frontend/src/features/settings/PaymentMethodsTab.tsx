import { useState } from 'react'
import { Button } from '../../components/Button'
import { ApiError } from '../../lib/api/types'
import type { SettingsTabProps } from './settings-tab-props'

const METHODS = [
  { key: 'cashEnabled', label: 'Cash' },
  { key: 'mobileMoneyEnabled', label: 'Mobile money' },
  { key: 'cardEnabled', label: 'Card' },
  { key: 'accountEnabled', label: 'Account' },
] as const

/** Doc 3/mockup Payment Methods tab — which tender types the Sell screen actually offers at checkout (a real setting now; the payment sheet previously always offered all four). */
export function PaymentMethodsTab({ settings, onSave, saving }: SettingsTabProps) {
  const [enabled, setEnabled] = useState({
    cashEnabled: settings.cashEnabled,
    mobileMoneyEnabled: settings.mobileMoneyEnabled,
    cardEnabled: settings.cardEnabled,
    accountEnabled: settings.accountEnabled,
  })
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await onSave(enabled)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="font-display text-lg font-semibold text-ink">Payment Methods</h2>
      <p className="mt-0.5 font-display text-[13px] text-ink-muted">Choose which tender types cashiers can select at checkout.</p>

      <ul className="mt-4 flex flex-col gap-2">
        {METHODS.map((m) => (
          <li key={m.key} className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="font-display text-sm text-ink">{m.label}</span>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enabled[m.key]}
                onChange={(e) => setEnabled((prev) => ({ ...prev, [m.key]: e.target.checked }))}
                className="h-5 w-5 accent-accent"
              />
            </label>
          </li>
        ))}
      </ul>

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
