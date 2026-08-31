import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { listCategories } from '../../lib/api/catalogue'
import { startStockTake } from '../../lib/api/stock-take'
import { ApiError, type StockTake, type StockTakeScope } from '../../lib/api/types'

/** Doc 3 §4.2: "Inventory → Stock take → choose full shop or a category." */
export function StartStockTakeScreen({ onStarted }: { onStarted: (stockTake: StockTake) => void }) {
  const [scope, setScope] = useState<StockTakeScope>('FULL')
  const [categoryId, setCategoryId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() })

  const mutation = useMutation({
    mutationFn: () => startStockTake(scope === 'CATEGORY' ? { scope, categoryId } : { scope: 'FULL' }),
    onSuccess: onStarted,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function submit() {
    setFormError(null)
    if (scope === 'CATEGORY' && !categoryId) {
      setFormError('Choose a category to count.')
      return
    }
    mutation.mutate()
  }

  return (
    <main className="flex flex-1 items-start justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6">
        <h1 className="font-display text-xl font-bold text-ink">Start a stock take</h1>
        <p className="mt-1 font-display text-sm text-ink-muted">
          The system freezes today's expected quantities, then guides you through counting one item at a time.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setScope('FULL')}
            className={`rounded-lg border p-4 text-left ${scope === 'FULL' ? 'border-accent bg-accent-wash' : 'border-border'}`}
          >
            <p className="font-display text-sm font-semibold text-ink">Full shop</p>
            <p className="font-display text-[12.5px] text-ink-muted">Count every product in the store.</p>
          </button>
          <button
            type="button"
            onClick={() => setScope('CATEGORY')}
            className={`rounded-lg border p-4 text-left ${scope === 'CATEGORY' ? 'border-accent bg-accent-wash' : 'border-border'}`}
          >
            <p className="font-display text-sm font-semibold text-ink">A category</p>
            <p className="font-display text-[12.5px] text-ink-muted">Count only products in one category.</p>
          </button>
        </div>

        {scope === 'CATEGORY' && (
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Category</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Choose a category…</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button size="speed" className="mt-5 w-full" isLoading={mutation.isPending} onClick={submit}>
          Start counting
        </Button>
      </div>
    </main>
  )
}
