import { CreditCard, Landmark, Lock, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import type { PaymentMethod } from '../../lib/api/types'
import { formatPesewas, parseCedisToPesewas } from '../../lib/money'
import { CartLineRow } from './CartLineRow'
import { computeCartTotals } from './cart-totals'
import { useCartStore } from './cart-store'

const METHOD_TILES: { value: PaymentMethod; label: string; icon: typeof Landmark }[] = [
  { value: 'CASH', label: 'Cash', icon: Landmark },
  { value: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone },
  { value: 'CARD', label: 'Card', icon: CreditCard },
]

export function CartPanel({ onCheckout }: { onCheckout: (preferredMethod: PaymentMethod) => void }) {
  const lines = useCartStore((s) => s.lines)
  const cartDiscountAmount = useCartStore((s) => s.cartDiscountAmount)
  const cartDiscountReason = useCartStore((s) => s.cartDiscountReason)
  const setCartDiscount = useCartStore((s) => s.setCartDiscount)
  const [discountInput, setDiscountInput] = useState(cartDiscountAmount ? String(cartDiscountAmount / 100) : '')
  const [preferredMethod, setPreferredMethod] = useState<PaymentMethod>('CASH')

  const totals = computeCartTotals(lines, cartDiscountAmount)

  function applyDiscount() {
    setCartDiscount(discountInput ? (parseCedisToPesewas(discountInput) ?? 0) : 0, cartDiscountReason)
  }

  return (
    <aside className="flex h-full flex-col border-l border-border bg-surface-raised">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Cart</h2>
          {lines.length > 0 && (
            <span className="rounded-full bg-accent-wash px-2 py-0.5 font-display text-[12px] font-semibold text-accent-strong">
              {lines.length} item{lines.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {lines.length === 0 ? (
          <div className="mt-4">
            <EmptyState message="No items yet — search or scan to add one." />
          </div>
        ) : (
          <ul className="mt-2">
            {lines.map((line) => (
              <CartLineRow key={line.variantId} line={line} />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex justify-between font-display text-sm text-ink-muted">
          <span>Subtotal</span>
          <span className="font-mono tabular-nums">{formatPesewas(totals.subtotal)}</span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="font-display text-sm text-ink-muted" title="A cart-wide discount, applied before tax">
            Discount
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            onBlur={applyDiscount}
            placeholder="0.00"
            className="h-9 w-28 rounded-md border border-border-strong bg-surface px-2 text-right font-mono text-sm tabular-nums text-ink"
          />
        </div>

        <div className="mt-2 flex justify-between font-display text-lg font-semibold text-ink">
          <span>Total</span>
          <span className="font-mono text-2xl tabular-nums">{formatPesewas(totals.total)}</span>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-md bg-accent-wash px-3 py-2">
          <span className="font-display text-sm font-medium text-accent-strong">Amount to pay</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-accent-strong">{formatPesewas(totals.total)}</span>
        </div>

        <Button size="speed" className="mt-4 w-full" disabled={lines.length === 0} onClick={() => onCheckout(preferredMethod)}>
          Charge {formatPesewas(totals.total)}
        </Button>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {METHOD_TILES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setPreferredMethod(value)}
              className={`flex flex-col items-center gap-1 rounded-md border py-2 font-display text-[12px] font-medium ${
                preferredMethod === value ? 'border-accent bg-accent-wash text-accent-strong' : 'border-border-strong text-ink-muted'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <p className="mt-2 flex items-center justify-center gap-1 font-display text-[11px] text-ink-faint">
          <Lock className="h-3 w-3" aria-hidden="true" /> Secure checkout
        </p>
      </div>
    </aside>
  )
}
