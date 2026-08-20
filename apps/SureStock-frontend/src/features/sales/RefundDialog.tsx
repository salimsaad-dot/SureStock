import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { createRefund } from '../../lib/api/sales'
import { ApiError, type CreateRefundBody, type PaymentMethod, type RefundLineInput, type Sale } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'

const REFUND_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MOBILE_MONEY', label: 'Mobile money' },
  { value: 'CARD', label: 'Card' },
  { value: 'ACCOUNT', label: 'Account' },
]

interface LineDraft {
  saleLineId: string
  quantity: number // 0 = not selected for refund
  restock: boolean
}

/** Doc 3 App Flow §5: "open the sale → Refund → select lines and quantities → choose restock or write off → refund method → confirm." */
export function RefundDialog({ sale, onClose, onSuccess }: { sale: Sale; onClose: () => void; onSuccess: (refund: Sale) => void }) {
  const refundableLines = sale.lines.filter((l) => l.quantity - l.quantityRefunded > 0)

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(refundableLines.map((l) => [l.id, { saleLineId: l.id, quantity: 0, restock: true }])),
  )
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const selectedLines = Object.values(drafts).filter((d) => d.quantity > 0)
  const refundTotal = selectedLines.reduce((sum, d) => {
    const line = sale.lines.find((l) => l.id === d.saleLineId)!
    const perUnit = line.lineTotal / line.quantity
    return sum + perUnit * d.quantity
  }, 0)

  const mutation = useMutation({
    mutationFn: (body: CreateRefundBody) => createRefund(sale.id, body),
    onSuccess,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function updateDraft(saleLineId: string, patch: Partial<LineDraft>) {
    setDrafts((prev) => ({ ...prev, [saleLineId]: { ...prev[saleLineId]!, ...patch } }))
  }

  function submit() {
    setFormError(null)
    if (selectedLines.length === 0) {
      setFormError('Select at least one line to refund.')
      return
    }
    if (!reason.trim()) {
      setFormError('A reason is required for a refund.')
      return
    }

    const body: CreateRefundBody = {
      id: crypto.randomUUID(),
      lines: selectedLines.map((d): RefundLineInput => ({ saleLineId: d.saleLineId, quantity: d.quantity, restock: d.restock })),
      method,
      reason: reason.trim(),
    }
    mutation.mutate(body)
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Refund {sale.receiptNumber}</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-4">
          {refundableLines.map((line) => {
            const remaining = line.quantity - line.quantityRefunded
            const draft = drafts[line.id]!
            return (
              <li key={line.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-sm text-ink">{line.productNameSnapshot}</p>
                    <p className="font-display text-[12px] text-ink-faint">
                      {remaining} of {line.quantity} refundable
                      {line.quantityRefunded > 0 && ` (${line.quantityRefunded} already refunded)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraft(line.id, { quantity: Math.max(0, draft.quantity - 1) })}
                      disabled={draft.quantity === 0}
                      className="h-9 w-9 rounded-md border border-border-strong text-ink disabled:opacity-40"
                      aria-label={`Decrease refund quantity for ${line.productNameSnapshot}`}
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-mono tabular-nums text-ink">{draft.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateDraft(line.id, { quantity: Math.min(remaining, draft.quantity + 1) })}
                      disabled={draft.quantity >= remaining}
                      className="h-9 w-9 rounded-md border border-border-strong text-ink disabled:opacity-40"
                      aria-label={`Increase refund quantity for ${line.productNameSnapshot}`}
                    >
                      +
                    </button>
                  </div>
                </div>
                {draft.quantity > 0 && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraft(line.id, { restock: true })}
                      className={`flex-1 rounded-md border px-3 py-2 font-display text-[13px] font-medium ${
                        draft.restock ? 'border-accent bg-accent-wash text-accent-strong' : 'border-border-strong text-ink-muted'
                      }`}
                    >
                      Restock
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDraft(line.id, { restock: false })}
                      className={`flex-1 rounded-md border px-3 py-2 font-display text-[13px] font-medium ${
                        !draft.restock ? 'border-danger bg-danger-wash text-danger' : 'border-border-strong text-ink-muted'
                      }`}
                    >
                      Write off (damaged)
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {refundableLines.length === 0 && <p className="mt-4 font-display text-sm text-ink-muted">Everything on this sale has already been refunded.</p>}

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Refund method</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {REFUND_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being refunded?" />
        </div>

        {refundTotal > 0 && (
          <p className="mt-3 font-display text-sm text-ink-muted">
            Refund total: <span className="font-mono font-semibold text-danger">{formatPesewas(refundTotal)}</span>
          </p>
        )}

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button variant="danger" className="mt-6 w-full" isLoading={mutation.isPending} onClick={submit} disabled={refundableLines.length === 0}>
          Confirm refund
        </Button>
      </div>
    </div>
  )
}
