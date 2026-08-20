import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { getSale } from '../../lib/api/sales'
import type { Sale } from '../../lib/api/types'
import { useToast } from '../../lib/toast-store'
import { ReceiptCard } from './ReceiptCard'
import { RefundDialog } from './RefundDialog'
import { SaleStatusPill } from './SaleStatusPill'

/** Doc 3 App Flow §5: "Tapping a transaction shows the full receipt... Refund: open the sale → Refund." */
export function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const show = useToast()
  const [refundOpen, setRefundOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: sale, isLoading } = useQuery({ queryKey: ['sale', id], queryFn: () => getSale(id!) })

  // Reached via the sales-list kebab menu's "Print receipt" — fires
  // once the receipt has actually rendered, then clears the flag so a
  // refresh or back-navigation doesn't reprint.
  useEffect(() => {
    if (searchParams.get('print') === '1' && sale) {
      window.print()
      setSearchParams((prev) => {
        prev.delete('print')
        return prev
      }, { replace: true })
    }
  }, [sale, searchParams, setSearchParams])

  function handleRefundSuccess(refund: Sale) {
    setRefundOpen(false)
    queryClient.invalidateQueries({ queryKey: ['sale', id] })
    queryClient.invalidateQueries({ queryKey: ['sales'] })
    show('Refund complete.')
    navigate(`/sales/${refund.id}`)
  }

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="text-ink-muted">Loading…</p>
      </main>
    )
  }

  if (!sale) {
    return (
      <main className="p-6">
        <p className="text-danger">Sale not found.</p>
      </main>
    )
  }

  const canRefund = !sale.refundOfSaleId && sale.status !== 'REFUNDED' && sale.status !== 'VOID'

  return (
    <main className="p-6">
      <Link to="/sales" className="font-display text-[13px] text-ink-muted hover:text-ink">
        ← Back to sales
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{sale.receiptNumber}</h1>
        <SaleStatusPill status={sale.status} />
      </div>
      <p className="mt-0.5 font-body text-sm text-ink-muted">{new Date(sale.soldAt).toLocaleString()}</p>

      {sale.refundOfSaleId && (
        <p className="mt-2 font-display text-[13px] text-ink-muted">
          Refund of{' '}
          <Link to={`/sales/${sale.refundOfSaleId}`} className="text-accent hover:text-accent-strong">
            the original sale
          </Link>
          .
        </p>
      )}

      <div className="mt-6 max-w-sm rounded-xl border border-border bg-surface-raised p-6">
        <ReceiptCard sale={sale} />
      </div>

      <div className="mt-6 flex max-w-sm gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
          Print
        </Button>
        {canRefund && (
          <Button variant="danger" className="flex-1" onClick={() => setRefundOpen(true)}>
            Refund
          </Button>
        )}
      </div>

      {refundOpen && <RefundDialog sale={sale} onClose={() => setRefundOpen(false)} onSuccess={handleRefundSuccess} />}
    </main>
  )
}
