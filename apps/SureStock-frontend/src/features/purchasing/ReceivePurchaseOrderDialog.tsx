import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { receivePurchaseOrder } from '../../lib/api/purchasing'
import { ApiError, type PurchaseOrder, type ReceivePurchaseOrderBody } from '../../lib/api/types'

interface LineDraft {
  lineId: string
  quantityReceived: number // 0 = not selected this receipt
}

/** Doc 3/mockup: receiving against a purchase order — bounded per-line quantity, same "cannot exceed what's outstanding" guard the backend enforces. */
export function ReceivePurchaseOrderDialog({
  po,
  onClose,
  onSuccess,
}: {
  po: PurchaseOrder
  onClose: () => void
  onSuccess: (po: PurchaseOrder) => void
}) {
  const outstandingLines = po.lines.filter((l) => l.quantityOrdered - l.quantityReceived > 0)

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(outstandingLines.map((l) => [l.id, { lineId: l.id, quantityReceived: l.quantityOrdered - l.quantityReceived }])),
  )
  const [formError, setFormError] = useState<string | null>(null)

  const selected = Object.values(drafts).filter((d) => d.quantityReceived > 0)

  const mutation = useMutation({
    mutationFn: (body: ReceivePurchaseOrderBody) => receivePurchaseOrder(po.id, body),
    onSuccess,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function updateDraft(lineId: string, quantityReceived: number) {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...prev[lineId]!, quantityReceived } }))
  }

  function submit() {
    setFormError(null)
    if (selected.length === 0) {
      setFormError('Enter a quantity for at least one line.')
      return
    }
    mutation.mutate({ lines: selected })
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Receive {po.orderNumber}</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {outstandingLines.map((line) => {
            const remaining = line.quantityOrdered - line.quantityReceived
            const draft = drafts[line.id]!
            return (
              <li key={line.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-sm text-ink">
                      {line.productName}
                      {line.variantName ? ` — ${line.variantName}` : ''}
                    </p>
                    <p className="font-display text-[12px] text-ink-faint">
                      {remaining} of {line.quantityOrdered} still outstanding
                      {line.quantityReceived > 0 && ` (${line.quantityReceived} already received)`}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={remaining}
                    step="any"
                    value={draft.quantityReceived}
                    onChange={(e) => updateDraft(line.id, Math.min(remaining, Math.max(0, Number(e.target.value))))}
                    className="h-10 w-20 rounded-md border border-border-strong bg-surface-raised px-2 text-right font-mono text-sm text-ink"
                    aria-label={`Quantity received for ${line.productName}`}
                  />
                </div>
              </li>
            )
          })}
        </ul>

        {outstandingLines.length === 0 && <p className="mt-4 font-display text-sm text-ink-muted">Everything on this order has already been received.</p>}

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button className="mt-6 w-full" isLoading={mutation.isPending} onClick={submit} disabled={outstandingLines.length === 0}>
          Confirm receipt
        </Button>
      </div>
    </div>
  )
}
