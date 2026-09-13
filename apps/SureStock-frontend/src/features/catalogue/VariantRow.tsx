import { Button } from '../../components/Button'
import { TableCell, TableRow } from '../../components/Table'
import { TextInput } from '../../components/TextInput'
import type { Variant } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'
import { StockLevelPill } from './StockLevelPill'
import { useVariantPriceEdit } from './useVariantPriceEdit'

/** Desktop table row — md and up. The mobile equivalent is VariantCard. */
export function VariantRow({ productId, variant }: { productId: string; variant: Variant }) {
  const { editing, setEditing, priceInput, setPriceInput, reason, setReason, priceError, reasonError, mutation, submit } = useVariantPriceEdit(
    productId,
    variant,
  )

  if (editing) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={6}>
          <div className="flex flex-wrap items-end gap-3 py-1">
            <span className="font-mono text-sm text-ink-muted">{variant.sku}</span>
            <TextInput label="New selling price (GH₵)" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} error={priceError ?? undefined} />
            <TextInput label="Reason for change" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError ?? undefined} />
            <Button size="default" isLoading={mutation.isPending} onClick={submit}>
              Save
            </Button>
            <Button size="default" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    // whitespace-nowrap on every data cell here: without it, an
    // auto-layout table with width:100% just shrinks/wraps its columns
    // to fit rather than overflowing — which is how "Edit price" ended
    // up wrapping into two lines and the price/cost text got crushed on
    // a phone screen. Forcing nowrap gives the row its real min-content
    // width back, so once that's wider than the screen, Table's own
    // horizontal scroll (with its scroll-shadow) takes over instead —
    // the same working behavior Inventory's table already has.
    <TableRow>
      <TableCell className="whitespace-nowrap">{variant.variantName ?? '—'}</TableCell>
      <TableCell className="whitespace-nowrap font-mono">{variant.sku}</TableCell>
      <TableCell className="whitespace-nowrap font-mono">{variant.barcode ?? '—'}</TableCell>
      <TableCell className="whitespace-nowrap">
        <StockLevelPill variant={variant} />{' '}
        <span className="font-mono text-ink-muted">{variant.quantityOnHand}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
        {formatPesewas(variant.sellingPrice)}
        {variant.costPrice !== undefined && (
          <div className="font-mono text-[11px] text-ink-faint">cost {formatPesewas(variant.costPrice)}</div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Button size="default" variant="secondary" onClick={() => setEditing(true)}>
          Edit price
        </Button>
      </TableCell>
    </TableRow>
  )
}
