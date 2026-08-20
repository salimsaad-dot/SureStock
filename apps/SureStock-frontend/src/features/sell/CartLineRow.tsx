import { Minus, Plus, Tag, X } from 'lucide-react'
import { useState } from 'react'
import { TextInput } from '../../components/TextInput'
import { ProductAvatar } from '../catalogue/ProductAvatar'
import { formatPesewas, parseCedisToPesewas } from '../../lib/money'
import { type CartLine, useCartStore } from './cart-store'

export function CartLineRow({ line }: { line: CartLine }) {
  const setQuantity = useCartStore((s) => s.setQuantity)
  const removeLine = useCartStore((s) => s.removeLine)
  const setLineDiscount = useCartStore((s) => s.setLineDiscount)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountInput, setDiscountInput] = useState(line.discountAmount ? String(line.discountAmount / 100) : '')
  const [reasonInput, setReasonInput] = useState(line.discountReason)

  const lineTotal = line.unitPrice * line.quantity - line.discountAmount

  function saveDiscount() {
    const pesewas = discountInput ? (parseCedisToPesewas(discountInput) ?? 0) : 0
    setLineDiscount(line.variantId, pesewas, reasonInput)
    setDiscountOpen(false)
  }

  return (
    <li className="border-b border-border py-3 last:border-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-2.5">
          <ProductAvatar name={line.productName} imageUrl={line.imageUrl ?? null} />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-medium text-ink">
              {line.productName}
              {line.variantName && <span className="text-ink-faint"> — {line.variantName}</span>}
            </p>
            <p className="font-mono text-[11px] text-ink-faint">{line.sku}</p>
            {line.discountAmount > 0 && (
              <p className="mt-0.5 font-display text-[11px] text-warning">− {formatPesewas(line.discountAmount)} discount</p>
            )}
          </div>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className="font-mono text-sm font-semibold tabular-nums text-ink">{formatPesewas(lineTotal)}</span>
          <button type="button" onClick={() => removeLine(line.variantId)} aria-label="Remove" className="text-ink-faint hover:text-danger">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-border-strong">
          <button
            type="button"
            onClick={() => setQuantity(line.variantId, line.quantity - 1)}
            className="flex h-9 w-9 items-center justify-center text-ink hover:bg-surface-sunken"
            aria-label="Decrease quantity"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="w-8 text-center font-mono text-sm tabular-nums text-ink">{line.quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(line.variantId, line.quantity + 1)}
            className="flex h-9 w-9 items-center justify-center text-ink hover:bg-surface-sunken"
            aria-label="Increase quantity"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDiscountOpen((open) => !open)}
          className="flex items-center gap-1 font-display text-[13px] text-ink-muted hover:text-accent"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          Discount
        </button>
      </div>

      {discountOpen && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <TextInput label="Discount (GH₵)" inputMode="decimal" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} />
          <TextInput label="Reason" value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} />
          <button type="button" onClick={saveDiscount} className="h-11 rounded-md bg-accent px-3 font-display text-[13px] font-semibold text-white">
            Apply
          </button>
        </div>
      )}
    </li>
  )
}
