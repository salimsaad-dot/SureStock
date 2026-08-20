import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { getStaff } from '../../lib/api/auth'
import { createSale } from '../../lib/api/sales'
import { ApiError, type CreateSaleBody, type PaymentMethod, type Sale } from '../../lib/api/types'
import { formatPesewas, parseCedisToPesewas } from '../../lib/money'
import { cartDiscountExceedsThreshold, computeCartTotals, lineExceedsThreshold } from './cart-totals'
import { useCartStore } from './cart-store'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile money' },
  { value: 'CARD', label: 'Card' },
  { value: 'ACCOUNT', label: 'Account' },
]

interface PaymentLine {
  method: PaymentMethod
  amountInput: string
}

export function PaymentSheet({
  onClose,
  onSuccess,
  initialMethod = 'CASH',
}: {
  onClose: () => void
  onSuccess: (sale: Sale) => void
  /** Pre-selected on the main Sell screen before Charge — split tender is still available here, this just skips the obvious first click for the common single-tender case. */
  initialMethod?: PaymentMethod
}) {
  const lines = useCartStore((s) => s.lines)
  const cartDiscountAmount = useCartStore((s) => s.cartDiscountAmount)
  const cartDiscountReason = useCartStore((s) => s.cartDiscountReason)
  const clearCart = useCartStore((s) => s.clear)
  const totals = computeCartTotals(lines, cartDiscountAmount)

  const [payments, setPayments] = useState<PaymentLine[]>([{ method: initialMethod, amountInput: String(totals.total / 100) }])
  const [needsOverride, setNeedsOverride] = useState(false)
  const [managerId, setManagerId] = useState('')
  const [managerPin, setManagerPin] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: staff } = useQuery({ queryKey: ['auth', 'staff'], queryFn: getStaff, enabled: needsOverride })
  const managers = staff?.filter((s) => s.role !== 'CASHIER') ?? []

  const paidTotal = payments.reduce((sum, p) => sum + (parseCedisToPesewas(p.amountInput) ?? 0), 0)
  const changeDue = Math.max(0, paidTotal - totals.total)
  const hasCash = payments.some((p) => p.method === 'CASH')

  const mutation = useMutation({
    mutationFn: (body: CreateSaleBody) => createSale(body),
    onSuccess: (sale) => {
      clearCart()
      onSuccess(sale)
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function addPayment() {
    setPayments((prev) => [...prev, { method: 'CASH', amountInput: '' }])
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index))
  }

  function submit() {
    setFormError(null)
    if (paidTotal < totals.total) {
      setFormError('Payments do not cover the total yet.')
      return
    }
    if (changeDue > 0 && !hasCash) {
      setFormError('Change can only be given on a cash payment.')
      return
    }

    const requiresOverride =
      lines.some((l) => lineExceedsThreshold(l.unitPrice, l.quantity, l.discountAmount)) ||
      cartDiscountExceedsThreshold(totals.subtotal, cartDiscountAmount)

    if (requiresOverride && !needsOverride) {
      setNeedsOverride(true)
      return
    }
    if (requiresOverride && (!managerId || !/^\d{4}$/.test(managerPin) || !overrideReason.trim())) {
      setFormError('Select a manager, enter their 4-digit PIN, and give a reason.')
      return
    }

    const body: CreateSaleBody = {
      id: crypto.randomUUID(),
      lines: lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        discountAmount: l.discountAmount || undefined,
        discountReason: l.discountReason || undefined,
      })),
      cartDiscountAmount: cartDiscountAmount || undefined,
      cartDiscountReason: cartDiscountReason || undefined,
      payments: payments.map((p) => ({ method: p.method, amount: parseCedisToPesewas(p.amountInput) ?? 0 })),
      ...(requiresOverride ? { managerOverride: { managerId, managerPin, reason: overrideReason } } : {}),
    }
    mutation.mutate(body)
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Payment</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mt-4 font-mono text-3xl font-semibold tabular-nums text-ink">{formatPesewas(totals.total)}</p>

        {!needsOverride && (
          <div className="mt-4 flex flex-col gap-3">
            {payments.map((payment, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="font-display text-[13px] font-medium text-ink">Method</span>
                  <select
                    className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
                    value={payment.method}
                    onChange={(e) => updatePayment(i, { method: e.target.value as PaymentMethod })}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <TextInput
                  label="Amount (GH₵)"
                  inputMode="decimal"
                  value={payment.amountInput}
                  onChange={(e) => updatePayment(i, { amountInput: e.target.value })}
                />
                {payments.length > 1 && (
                  <button type="button" onClick={() => removePayment(i)} className="h-11 px-2 text-ink-faint hover:text-danger">
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addPayment} className="self-start font-display text-[13px] text-accent hover:text-accent-strong">
              + Split into another payment method
            </button>

            {changeDue > 0 && (
              <p className="font-display text-sm text-ink-muted">
                Change due: <span className="font-mono font-semibold text-ink">{formatPesewas(changeDue)}</span>
              </p>
            )}
          </div>
        )}

        {needsOverride && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-warning bg-warning-wash p-4">
            <p className="font-display text-[13px] font-semibold text-ink">This discount needs manager approval.</p>
            <label className="flex flex-col gap-1.5">
              <span className="font-display text-[13px] font-medium text-ink">Manager</span>
              <select
                className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
              >
                <option value="">Select a manager…</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <TextInput label="Manager PIN" inputMode="numeric" maxLength={4} value={managerPin} onChange={(e) => setManagerPin(e.target.value)} />
            <TextInput label="Reason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
          </div>
        )}

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button size="speed" className="mt-6 w-full" isLoading={mutation.isPending} onClick={submit}>
          {needsOverride ? 'Approve and charge' : `Charge ${formatPesewas(totals.total)}`}
        </Button>
      </div>
    </div>
  )
}
