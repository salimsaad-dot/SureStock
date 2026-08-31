import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { getStockTake, updateStockTakeLine } from '../../lib/api/stock-take'
import { ApiError, type StockTakeLine } from '../../lib/api/types'
import { useToast } from '../../lib/toast-store'
import { NumericKeypad } from './NumericKeypad'

function varianceText(entry: string, expectedQuantity: number): { text: string; tone: 'muted' | 'success' | 'danger' } {
  if (entry === '') return { text: `Expected ${expectedQuantity} on the system`, tone: 'muted' }
  const counted = Number(entry)
  if (!Number.isFinite(counted)) return { text: `Expected ${expectedQuantity} on the system`, tone: 'muted' }
  const diff = counted - expectedQuantity
  if (diff === 0) return { text: `Matches the system count of ${expectedQuantity}`, tone: 'success' }
  return { text: `${diff > 0 ? '+' : ''}${diff} against expected ${expectedQuantity}`, tone: 'danger' }
}

/**
 * Doc 3 §4.2: "a count list... item name, a big number field, and
 * next. Counted lines show a live variance." Split out from
 * `CountingScreen` and always mounted with `key={line.id}` — the
 * idiomatic React way to reset local state (the entry field, any error)
 * when the current line changes, instead of an effect that copies a
 * prop into state after the fact.
 */
function CountingCard({
  line,
  saveLabel,
  isSaving,
  onSubmit,
}: {
  line: StockTakeLine
  saveLabel: string
  isSaving: boolean
  onSubmit: (countedQuantity: number) => void
}) {
  const [entry, setEntry] = useState(line.countedQuantity?.toString() ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  function pressDigit(d: string) {
    setEntry((prev) => (prev === '0' ? d : prev + d))
  }
  function pressDecimal() {
    setEntry((prev) => (prev.includes('.') ? prev : prev === '' ? '0.' : prev + '.'))
  }
  function pressBackspace() {
    setEntry((prev) => prev.slice(0, -1))
  }

  function submit() {
    setFormError(null)
    const counted = Number(entry)
    if (entry === '' || !Number.isFinite(counted) || counted < 0) {
      setFormError('Enter a valid count.')
      return
    }
    onSubmit(counted)
  }

  const variance = varianceText(entry, line.expectedQuantity)
  const toneClass = variance.tone === 'success' ? 'text-success' : variance.tone === 'danger' ? 'text-danger' : 'text-ink-muted'

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-5">
      <p className="font-display text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">Count this item</p>
      <p className="mt-1 font-display text-2xl font-bold leading-tight text-ink">
        {line.productName}
        {line.variantName ? ` — ${line.variantName}` : ''}
      </p>
      <p className="font-mono text-[12.5px] text-ink-muted">{line.sku}</p>

      <p className="mt-4 font-display text-[13px] font-medium text-ink">Counted quantity</p>
      <div className="mt-1.5 flex h-[72px] items-center justify-end rounded-md border border-accent bg-surface-raised px-4 font-mono text-4xl font-semibold text-ink shadow-[0_0_0_2px_var(--accent-wash)]">
        {entry || '0'}
      </div>
      <p className={`mt-1.5 font-display text-[12.5px] ${toneClass}`}>{variance.text}</p>

      <div className="mt-4">
        <NumericKeypad onDigit={pressDigit} onDecimal={pressDecimal} onBackspace={pressBackspace} />
      </div>

      {formError && (
        <p role="alert" className="mt-3 font-display text-[13px] text-danger">
          {formError}
        </p>
      )}

      <Button size="speed" className="mt-4 w-full" isLoading={isSaving} onClick={submit}>
        {saveLabel}
      </Button>
    </div>
  )
}

/**
 * One line at a time, client-side, over the whole line set fetched
 * once (see stock-take.ts's own comment on why that's fine at launch
 * scale) — each submission is its own `PATCH`, which is what makes
 * T-27's "progress survives interruption" true: nothing here is
 * only-in-memory until a final submit.
 */
export function CountingScreen({
  stockTakeId,
  jumpToLineId,
  onReview,
}: {
  stockTakeId: string
  jumpToLineId?: string
  onReview: () => void
}) {
  const queryClient = useQueryClient()
  const show = useToast()

  const { data: stockTake, isLoading } = useQuery({ queryKey: ['stock-take', stockTakeId], queryFn: () => getStockTake(stockTakeId) })

  const lines = stockTake?.lines ?? []
  const countedCount = lines.filter((l) => l.countedQuantity !== null).length
  const currentLine: StockTakeLine | undefined = jumpToLineId
    ? lines.find((l) => l.id === jumpToLineId)
    : lines.find((l) => l.countedQuantity === null)

  const mutation = useMutation({
    mutationFn: (countedQuantity: number) => updateStockTakeLine(stockTakeId, currentLine!.id, { countedQuantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-take', stockTakeId] })
      if (jumpToLineId) onReview()
    },
    onError: (err) => show(err instanceof ApiError ? err.message : 'Could not save that count.', 'error'),
  })

  if (isLoading || !stockTake) {
    return (
      <main className="p-6">
        <p className="font-display text-sm text-ink-muted">Loading…</p>
      </main>
    )
  }

  if (!currentLine) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-lg font-semibold text-ink">Every item has been counted.</p>
        <p className="font-display text-sm text-ink-muted">Review the discrepancies and post the adjustments.</p>
        <Button size="speed" onClick={onReview}>
          Review &amp; post
        </Button>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-5 p-5">
      <div className="w-full max-w-md">
        <div className="flex justify-between font-display text-[12.5px] text-ink-muted">
          <span>Stock take {stockTake.categoryName ? `· ${stockTake.categoryName}` : '· Full shop'}</span>
          <span className="font-mono">
            {countedCount} of {lines.length}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full bg-accent" style={{ width: `${lines.length ? (countedCount / lines.length) * 100 : 0}%` }} />
        </div>
      </div>

      <CountingCard
        key={currentLine.id}
        line={currentLine}
        saveLabel={jumpToLineId ? 'Save' : 'Next'}
        isSaving={mutation.isPending}
        onSubmit={(counted) => mutation.mutate(counted)}
      />

      <button type="button" onClick={onReview} className="font-display text-[13px] font-medium text-accent hover:text-accent-strong">
        Review &amp; post ({lines.filter((l) => l.countedQuantity !== null && l.variance !== 0).length} discrepancies so far)
      </button>
    </main>
  )
}
