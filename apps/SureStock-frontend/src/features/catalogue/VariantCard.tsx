import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import type { Variant } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'
import { StockLevelPill } from './StockLevelPill'
import { useVariantPriceEdit } from './useVariantPriceEdit'

/**
 * Mobile equivalent of VariantRow — below md. A horizontally-scrolling
 * table is the right call for Inventory's long product list, but forcing
 * one here just to show a single variant's half-dozen short fields reads
 * as broken rather than responsive (real feedback from live mobile
 * testing). A stacked card reads top to bottom instead, no scrolling.
 */
export function VariantCard({ productId, variant }: { productId: string; variant: Variant }) {
  const { editing, setEditing, priceInput, setPriceInput, reason, setReason, priceError, reasonError, mutation, submit } = useVariantPriceEdit(
    productId,
    variant,
  )

  if (editing) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-4">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-sm text-ink-muted">{variant.sku}</span>
          <TextInput label="New selling price (GH₵)" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} error={priceError ?? undefined} />
          <TextInput label="Reason for change" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError ?? undefined} />
          <div className="flex gap-2">
            <Button size="default" className="flex-1" isLoading={mutation.isPending} onClick={submit}>
              Save
            </Button>
            <Button size="default" variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-ink">{variant.variantName ?? variant.sku}</p>
          <p className="truncate font-mono text-[12px] text-ink-faint">{variant.sku}</p>
        </div>
        <StockLevelPill variant={variant} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 font-display text-[13px]">
        <div>
          <dt className="text-ink-faint">Barcode</dt>
          <dd className="font-mono text-ink">{variant.barcode ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Stock</dt>
          <dd className="font-mono text-ink">{variant.quantityOnHand}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Price</dt>
          <dd className="font-mono font-semibold tabular-nums text-ink">{formatPesewas(variant.sellingPrice)}</dd>
        </div>
        {variant.costPrice !== undefined && (
          <div>
            <dt className="text-ink-faint">Cost</dt>
            <dd className="font-mono tabular-nums text-ink-muted">{formatPesewas(variant.costPrice)}</dd>
          </div>
        )}
      </dl>

      <Button size="default" variant="secondary" className="mt-3 w-full" onClick={() => setEditing(true)}>
        Edit price
      </Button>
    </div>
  )
}
