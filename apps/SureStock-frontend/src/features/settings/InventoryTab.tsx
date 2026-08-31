import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { ApiError } from '../../lib/api/types'
import type { SettingsTabProps } from './settings-tab-props'

/**
 * Doc 3/mockup Inventory tab. Reorder point/quantity already live
 * per-variant (T-06) — there's no other real global inventory setting
 * to put here, so this tab is scoped to exactly one thing: a default
 * that pre-fills a new product's variant fields when they're left
 * blank (NewProductPage), not a server-enforced rule.
 */
export function InventoryTab({ settings, onSave, saving }: SettingsTabProps) {
  const [defaultReorderPoint, setDefaultReorderPoint] = useState(settings.defaultReorderPoint?.toString() ?? '')
  const [defaultReorderQuantity, setDefaultReorderQuantity] = useState(settings.defaultReorderQuantity?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const point = defaultReorderPoint === '' ? undefined : Number(defaultReorderPoint)
    const quantity = defaultReorderQuantity === '' ? undefined : Number(defaultReorderQuantity)
    if ((point !== undefined && (!Number.isFinite(point) || point < 0)) || (quantity !== undefined && (!Number.isFinite(quantity) || quantity < 0))) {
      setError('Reorder point and quantity must be non-negative numbers.')
      return
    }
    try {
      await onSave({ defaultReorderPoint: point, defaultReorderQuantity: quantity })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="font-display text-lg font-semibold text-ink">Inventory</h2>
      <p className="mt-0.5 font-display text-[13px] text-ink-muted">
        Default reorder point and quantity suggested when adding a new product — each product can still set its own.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <TextInput label="Default reorder point" inputMode="decimal" value={defaultReorderPoint} onChange={(e) => setDefaultReorderPoint(e.target.value)} />
        <TextInput
          label="Default reorder quantity"
          inputMode="decimal"
          value={defaultReorderQuantity}
          onChange={(e) => setDefaultReorderQuantity(e.target.value)}
        />
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
