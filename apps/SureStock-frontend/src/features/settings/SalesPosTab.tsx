import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { ApiError } from '../../lib/api/types'
import { parseCedisToPesewas } from '../../lib/money'
import type { SettingsTabProps } from './settings-tab-props'

/** Doc 3/mockup Sales & POS tab — the two till-time business rules that used to be hardcoded constants (sale.service.ts / till-shift.service.ts), now real per-location settings. */
export function SalesPosTab({ settings, onSave, saving }: SettingsTabProps) {
  const [discountThreshold, setDiscountThreshold] = useState(String(settings.discountOverrideThresholdPercent))
  const [varianceThreshold, setVarianceThreshold] = useState((settings.tillVarianceThreshold / 100).toFixed(2))
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const discountPercent = Number(discountThreshold)
    const variancePesewas = parseCedisToPesewas(varianceThreshold)
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      setError('Discount threshold must be a percentage between 0 and 100.')
      return
    }
    if (variancePesewas === null) {
      setError('Till variance threshold must be a valid amount.')
      return
    }
    try {
      await onSave({ discountOverrideThresholdPercent: discountPercent, tillVarianceThreshold: variancePesewas })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="font-display text-lg font-semibold text-ink">Sales & POS</h2>
      <p className="mt-0.5 font-display text-[13px] text-ink-muted">Rules that apply at the till.</p>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <TextInput
            label="Discount override threshold (%)"
            inputMode="decimal"
            value={discountThreshold}
            onChange={(e) => setDiscountThreshold(e.target.value)}
          />
          <p className="mt-1 font-display text-[12.5px] text-ink-muted">
            A discount past this percentage of a sale's gross needs manager PIN approval before it can be charged.
          </p>
        </div>
        <div>
          <TextInput
            label="Till variance alert threshold (GH₵)"
            inputMode="decimal"
            value={varianceThreshold}
            onChange={(e) => setVarianceThreshold(e.target.value)}
          />
          <p className="mt-1 font-display text-[12.5px] text-ink-muted">
            Closing a till shift with a counted-vs-expected cash difference past this amount logs an audit alert.
          </p>
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
