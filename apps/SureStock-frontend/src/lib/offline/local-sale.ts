import type { CartLine } from '../../features/sell/cart-store'
import type { CartTotals } from '../../features/sell/cart-totals'
import type { CreateSaleBody, PaymentInput, Sale } from '../api/types'

/**
 * A sale charged while offline can't wait for the server to assign a
 * receipt number — but it doesn't need to, since `sale.service.ts`
 * computes it as a pure function of the sale's own client-generated id
 * (`RCT-${id...}`, sale.service.ts:324). Reproducing that formula here
 * means the receipt shown offline is byte-for-byte what the server will
 * eventually record, not a placeholder that gets swapped out later.
 *
 * Known gap, same one `cart-totals.ts` already documents for the online
 * preview: no tax computation and no cart-discount proration into each
 * line's own `lineTotal` — this is a receipt for display only, the real
 * `POST /sync/batch` call carries the authoritative per-line amounts and
 * lets the server recompute everything correctly regardless.
 */
export function buildLocalSale(params: {
  body: CreateSaleBody
  lines: CartLine[]
  totals: CartTotals
  payments: PaymentInput[]
  changeDue: number
  userId: string
  tillShiftId: string
  locationId: string
}): Sale {
  const { body, lines, totals, payments, changeDue, userId, tillShiftId, locationId } = params
  const receiptNumber = `RCT-${body.id.replace(/-/g, '').slice(-10).toUpperCase()}`
  const soldAt = body.soldAt ?? new Date().toISOString()

  return {
    id: body.id,
    receiptNumber,
    locationId,
    tillShiftId,
    userId,
    customerId: body.customerId ?? null,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: 0,
    total: totals.total,
    status: 'COMPLETED',
    refundOfSaleId: null,
    soldAt,
    lines: lines.map((l) => ({
      id: crypto.randomUUID(),
      variantId: l.variantId,
      productNameSnapshot: l.productName,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount || null,
      discountReason: l.discountReason || null,
      lineTotal: l.unitPrice * l.quantity - l.discountAmount,
      taxAmount: 0,
      quantityRefunded: 0,
    })),
    payments: [
      ...payments.map((p) => ({
        id: crypto.randomUUID(),
        method: p.method,
        amount: p.amount,
        reference: p.reference ?? null,
        provider: p.provider ?? null,
        status: 'CONFIRMED' as const,
      })),
      ...(changeDue > 0
        ? [{ id: crypto.randomUUID(), method: 'CHANGE' as const, amount: changeDue, reference: null, provider: null, status: 'CONFIRMED' as const }]
        : []),
    ],
  }
}
