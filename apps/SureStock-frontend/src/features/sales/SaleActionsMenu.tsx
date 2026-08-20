import { Download, Eye, Printer, RotateCcw } from 'lucide-react'
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSale } from '../../lib/api/sales'
import type { SaleListItem } from '../../lib/api/types'
import { triggerBrowserDownload } from '../../lib/download'
import { formatPesewas } from '../../lib/money'

/** Plain-text receipt — matches ReceiptCard's own content, no PDF dependency (same honest gap as everywhere else a real rendering library would be a new dependency to decide on, not add unprompted). */
async function downloadReceiptText(saleId: string, receiptNumber: string) {
  const sale = await getSale(saleId)
  const lines = [
    sale.total < 0 ? 'REFUND' : 'SALE COMPLETE',
    sale.receiptNumber,
    '',
    ...sale.lines.map((l) => `${Math.abs(l.quantity)} x ${l.productNameSnapshot}  ${formatPesewas(Math.abs(l.lineTotal))}`),
    '',
    `Subtotal  ${formatPesewas(Math.abs(sale.subtotal))}`,
    ...(sale.discountTotal !== 0 ? [`Discount  -${formatPesewas(Math.abs(sale.discountTotal))}`] : []),
    ...(sale.taxTotal !== 0 ? [`Tax  ${formatPesewas(Math.abs(sale.taxTotal))}`] : []),
    `Total  ${formatPesewas(Math.abs(sale.total))}`,
    '',
    ...sale.payments.map((p) => `${p.method === 'CHANGE' ? 'Change given' : p.method.replace('_', ' ')}  ${formatPesewas(Math.abs(p.amount))}`),
  ]
  triggerBrowserDownload(new Blob([lines.join('\n')], { type: 'text/plain' }), `${receiptNumber}.txt`)
}

export function SaleActionsMenu({ sale, onRefund }: { sale: SaleListItem; onRefund: (saleId: string) => void }) {
  const navigate = useNavigate()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const canRefund = !sale.refundOfSaleId && sale.status !== 'REFUNDED' && sale.status !== 'VOID'

  function runAndClose(action: () => void) {
    action()
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details ref={detailsRef} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <summary
        aria-label="Transaction actions"
        className="flex h-8 w-8 list-none items-center justify-center rounded-md text-ink-faint hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
      >
        ⋮
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-border bg-surface-raised py-1 shadow-lg">
        <button
          type="button"
          onClick={() => runAndClose(() => navigate(`/sales/${sale.id}`))}
          className="flex w-full items-center gap-2 px-3 py-2 text-left font-display text-[13px] text-ink hover:bg-surface-sunken"
        >
          <Eye className="h-4 w-4" aria-hidden="true" /> View receipt
        </button>
        <button
          type="button"
          onClick={() => runAndClose(() => navigate(`/sales/${sale.id}?print=1`))}
          className="flex w-full items-center gap-2 px-3 py-2 text-left font-display text-[13px] text-ink hover:bg-surface-sunken"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> Print receipt
        </button>
        <button
          type="button"
          onClick={() => runAndClose(() => downloadReceiptText(sale.id, sale.receiptNumber))}
          className="flex w-full items-center gap-2 px-3 py-2 text-left font-display text-[13px] text-ink hover:bg-surface-sunken"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download receipt
        </button>
        {canRefund && (
          <button
            type="button"
            onClick={() => runAndClose(() => onRefund(sale.id))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left font-display text-[13px] text-danger hover:bg-danger-wash"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Refund transaction
          </button>
        )}
      </div>
    </details>
  )
}
