import type { Sale } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'

/** T-17: `GET /sales/:id` already carries everything a receipt needs — this just renders it. Shared by the post-sale flow (ReceiptView) and the sales-history detail page. */
export function ReceiptCard({ sale }: { sale: Sale }) {
  const isRefund = sale.total < 0

  return (
    <div>
      <p className={`text-center font-mono text-xs uppercase tracking-wide ${isRefund ? 'text-danger' : 'text-success'}`}>
        {isRefund ? 'Refund' : 'Sale complete'}
      </p>
      <p className="mt-1 text-center font-mono text-sm text-ink-faint">{sale.receiptNumber}</p>

      <ul className="mt-4 divide-y divide-border">
        {sale.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-3 py-2 font-display text-sm">
            <span className="text-ink">
              {Math.abs(line.quantity)} × {line.productNameSnapshot}
            </span>
            <span className="font-mono tabular-nums text-ink">{formatPesewas(Math.abs(line.lineTotal))}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-border pt-3">
        <div className="flex justify-between font-display text-sm text-ink-muted">
          <span>Subtotal</span>
          <span className="font-mono tabular-nums">{formatPesewas(Math.abs(sale.subtotal))}</span>
        </div>
        {sale.discountTotal !== 0 && (
          <div className="flex justify-between font-display text-sm text-warning">
            <span>Discount</span>
            <span className="font-mono tabular-nums">− {formatPesewas(Math.abs(sale.discountTotal))}</span>
          </div>
        )}
        {sale.taxTotal !== 0 && (
          <div className="flex justify-between font-display text-sm text-ink-muted">
            <span>Tax</span>
            <span className="font-mono tabular-nums">{formatPesewas(Math.abs(sale.taxTotal))}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between font-display text-lg font-semibold text-ink">
          <span>Total</span>
          <span className={`font-mono text-xl tabular-nums ${isRefund ? 'text-danger' : 'text-ink'}`}>
            {isRefund && '− '}
            {formatPesewas(Math.abs(sale.total))}
          </span>
        </div>
      </div>

      <ul className="mt-2 font-display text-[13px] text-ink-muted">
        {sale.payments.map((p) => (
          <li key={p.id} className="flex justify-between">
            <span>{p.method === 'CHANGE' ? 'Change given' : p.method.replace('_', ' ')}</span>
            <span className="font-mono tabular-nums">{formatPesewas(Math.abs(p.amount))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
