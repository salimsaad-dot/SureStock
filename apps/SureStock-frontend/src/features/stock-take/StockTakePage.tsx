import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { abandonStockTake, listStockTakes } from '../../lib/api/stock-take'
import type { PostedStockTake, StockTake } from '../../lib/api/types'
import { useToast } from '../../lib/toast-store'
import { CountingScreen } from './CountingScreen'
import { ReviewScreen } from './ReviewScreen'
import { StartStockTakeScreen } from './StartStockTakeScreen'

type Mode = { view: 'counting'; jumpToLineId?: string } | { view: 'review' } | { view: 'posted'; posted: PostedStockTake }

/** Doc 3 §4.2's whole flow, orchestrated: start → count one item at a time → review discrepancies → post, which then locks the record. */
export function StockTakePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const show = useToast()
  const [mode, setMode] = useState<Mode>({ view: 'counting' })

  const { data: inProgress, isLoading } = useQuery({
    queryKey: ['stock-takes', 'in-progress'],
    queryFn: () => listStockTakes({ status: 'IN_PROGRESS', pageSize: 1 }),
  })
  const stockTake: StockTake | undefined = inProgress?.items[0]

  async function handleAbandon() {
    if (!stockTake) return
    if (!window.confirm('Abandon this stock take? Nothing counted so far will be posted.')) return
    await abandonStockTake(stockTake.id)
    queryClient.invalidateQueries({ queryKey: ['stock-takes'] })
    show('Stock take abandoned.')
  }

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="font-display text-sm text-ink-muted">Loading…</p>
      </main>
    )
  }

  if (mode.view === 'posted') {
    const { posted } = mode
    const adjustedCount = posted.adjustments.filter((a) => a.delta !== 0).length
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-lg font-semibold text-ink">Stock take posted.</p>
        <p className="font-display text-sm text-ink-muted">
          {adjustedCount === 0 ? 'No adjustments were needed — everything matched.' : `${adjustedCount} item${adjustedCount === 1 ? '' : 's'} adjusted.`}
        </p>
        {adjustedCount > 0 && (
          <ul className="mt-2 flex w-full max-w-sm flex-col gap-1.5 text-left">
            {posted.adjustments
              .filter((a) => a.delta !== 0)
              .map((a) => (
                <li key={a.variantId} className="flex justify-between font-display text-[13px]">
                  <span className="text-ink-muted">{a.sku}</span>
                  <span className={`font-mono font-medium ${a.delta < 0 ? 'text-danger' : 'text-success'}`}>
                    {a.delta > 0 ? '+' : ''}
                    {a.delta}
                  </span>
                </li>
              ))}
          </ul>
        )}
        <Link to="/inventory">
          <Button className="mt-4">Back to Inventory</Button>
        </Link>
      </main>
    )
  }

  if (!stockTake) {
    return <StartStockTakeScreen onStarted={() => queryClient.invalidateQueries({ queryKey: ['stock-takes'] })} />
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <button
          type="button"
          onClick={() => navigate('/inventory')}
          className="font-display text-[13px] text-ink-muted hover:text-ink"
        >
          ← Back to Inventory
        </button>
        <button type="button" onClick={handleAbandon} className="font-display text-[13px] text-danger hover:opacity-80">
          Abandon
        </button>
      </div>

      {mode.view === 'counting' && (
        <CountingScreen
          stockTakeId={stockTake.id}
          jumpToLineId={mode.jumpToLineId}
          onReview={() => setMode({ view: 'review' })}
        />
      )}
      {mode.view === 'review' && (
        <ReviewScreen
          stockTakeId={stockTake.id}
          onEditLine={(lineId) => setMode({ view: 'counting', jumpToLineId: lineId })}
          onPosted={(posted) => setMode({ view: 'posted', posted })}
        />
      )}
    </div>
  )
}
