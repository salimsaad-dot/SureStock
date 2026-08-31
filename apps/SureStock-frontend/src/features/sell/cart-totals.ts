import type { CartLine } from './cart-store'

export interface CartTotals {
  subtotal: number
  discountTotal: number
  total: number
}

/**
 * Client-side preview only — the server (`sale.service.ts`) is always
 * the authoritative calculation, re-reading live prices inside the
 * transaction. This mirrors it closely enough for the cart to show a
 * correct running total before checkout, per T-14's "totals... correct
 * to the pesewa" criterion.
 *
 * Known gap: tax isn't previewed here (no product in this catalogue has
 * a `taxRateId` set yet, and fetching + replicating the inclusive/
 * exclusive tax math client-side wasn't built this pass) — the real
 * `POST /sales` response is still exactly right regardless.
 */
export function computeCartTotals(lines: CartLine[], cartDiscountAmount: number): CartTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const lineDiscountTotal = lines.reduce((sum, l) => sum + l.discountAmount, 0)
  const discountTotal = lineDiscountTotal + cartDiscountAmount
  const total = subtotal - discountTotal
  return { subtotal, discountTotal, total }
}

// The real threshold now comes from GET /settings/checkout (Doc 6 T-29) —
// callers fetch it and pass it in, rather than this module guessing at a
// value that could drift from the backend's own per-location setting.

export function lineExceedsThreshold(unitPrice: number, quantity: number, discountAmount: number, thresholdPercent: number): boolean {
  const gross = unitPrice * quantity
  if (gross <= 0 || discountAmount <= 0) return false
  return (discountAmount / gross) * 100 > thresholdPercent
}

export function cartDiscountExceedsThreshold(subtotal: number, cartDiscountAmount: number, thresholdPercent: number): boolean {
  if (subtotal <= 0 || cartDiscountAmount <= 0) return false
  return (cartDiscountAmount / subtotal) * 100 > thresholdPercent
}
