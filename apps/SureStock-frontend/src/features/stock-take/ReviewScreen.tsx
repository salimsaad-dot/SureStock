import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { getDiscrepancies, postStockTake, updateStockTakeLine } from '../../lib/api/stock-take'
import { ApiError, type PostedStockTake, type StockTakeLine } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'

/** Doc 3 §4.2: "a review screen lists only the discrepancies, sorted by value impact, each requiring a reason before posting." */
export function ReviewScreen({
  stockTakeId,
  onEditLine,
  onPosted,
}: {
  stockTakeId: string
  onEditLine: (lineId: string) => void
  onPosted: (posted: PostedStockTake) => void
}) {
  const queryClient = useQueryClient()
  // Only holds an entry once the user has actually typed in that row —
  // otherwise the displayed value falls back to the server's own
  // `reason`, so there's no need to copy server data into state via an
  // effect just to seed it.
  const [editedReasons, setEditedReasons] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const { data: discrepancies, isLoading } = useQuery({ queryKey: ['stock-take', stockTakeId, 'discrepancies'], queryFn: () => getDiscrepancies(stockTakeId) })

  function reasonFor(line: StockTakeLine): string {
    return editedReasons[line.id] ?? line.reason ?? ''
  }

  const saveReason = useMutation({
    mutationFn: ({ lineId, reason }: { lineId: string; reason: string }) => updateStockTakeLine(stockTakeId, lineId, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-take', stockTakeId, 'discrepancies'] }),
  })

  const postMutation = useMutation({
    mutationFn: () => postStockTake(stockTakeId),
    onSuccess: onPosted,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  async function handlePost() {
    setFormError(null)
    if (!discrepancies) return
    if (discrepancies.some((d) => !reasonFor(d).trim())) {
      setFormError('Every discrepancy needs a reason before posting.')
      return
    }
    // Make sure every reason actually landed on the server, even one just typed and not yet blurred away from.
    await Promise.all(
      discrepancies
        .filter((d) => (d.reason ?? '') !== reasonFor(d))
        .map((d) => saveReason.mutateAsync({ lineId: d.id, reason: reasonFor(d) })),
    )
    postMutation.mutate()
  }

  if (isLoading || !discrepancies) {
    return (
      <main className="p-6">
        <p className="font-display text-sm text-ink-muted">Loading…</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <h1 className="font-display text-xl font-bold text-ink">Review variances</h1>
      <p className="mt-1 font-display text-sm text-ink-muted">Only discrepancies are shown, largest value impact first. Each needs a reason before posting.</p>

      {discrepancies.length === 0 ? (
        <p className="mt-6 font-display text-sm text-ink-muted">No discrepancies — every counted item matched the system.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {discrepancies.map((d: StockTakeLine) => (
            <li key={d.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-display text-sm text-ink">
                    {d.productName}
                    {d.variantName ? ` — ${d.variantName}` : ''}
                  </p>
                  <p className="font-mono text-[12px] text-ink-faint">
                    {d.expectedQuantity} → {d.countedQuantity}
                  </p>
                </div>
                <span className={`font-mono text-sm font-semibold ${(d.variance ?? 0) < 0 ? 'text-danger' : 'text-success'}`}>
                  {(d.variance ?? 0) > 0 ? '+' : ''}
                  {d.variance}
                </span>
                <span className="w-24 text-right font-mono text-[12.5px] text-ink-muted">{formatPesewas(Math.abs(d.varianceValue ?? 0))}</span>
                <button type="button" onClick={() => onEditLine(d.id)} className="font-display text-[12.5px] text-accent hover:text-accent-strong">
                  Edit
                </button>
              </div>
              <div className="mt-2">
                <TextInput
                  label="Reason"
                  value={reasonFor(d)}
                  onChange={(e) => setEditedReasons((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  onBlur={() => {
                    const value = reasonFor(d)
                    if ((d.reason ?? '') !== value && value.trim()) {
                      saveReason.mutate({ lineId: d.id, reason: value })
                    }
                  }}
                  placeholder="Why is this different from expected?"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {formError && (
        <p role="alert" className="mt-3 font-display text-[13px] text-danger">
          {formError}
        </p>
      )}

      <Button size="speed" className="mt-6 w-full" isLoading={postMutation.isPending} onClick={handlePost}>
        Post adjustments
      </Button>
    </main>
  )
}
