import { z } from 'zod';

const pesewasSchema = z.number().int().nonnegative();

const saleLineInputSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().positive('Quantity must be greater than zero.'),
  // Price and cost are never taken from the client — always read fresh
  // from the variant inside the sale-write transaction (Doc 2 §3.3:
  // "price and cost captured at that moment"). Only the discount is a
  // real client input.
  discountAmount: pesewasSchema.optional(),
  discountReason: z.string().optional(),
});

// CHANGE is never a client-supplied method — the server generates it.
const paymentInputSchema = z.object({
  method: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'ACCOUNT']),
  amount: pesewasSchema,
  reference: z.string().optional(),
  provider: z.string().optional(),
});

// Doc 6 T-18: "discounts above the threshold demand a manager PIN and a
// reason; every override is logged with both users."
const managerOverrideSchema = z.object({
  managerId: z.string().min(1),
  managerPin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits.'),
  reason: z.string().min(1, 'A reason is required for a discount override.'),
});

export const createSaleBodySchema = z.object({
  // Client-generated — doubles as the idempotency key (Doc 2 §3.2).
  id: z.string().min(1),
  customerId: z.string().min(1).optional(),
  lines: z.array(saleLineInputSchema).min(1, 'A sale needs at least one line.'),
  cartDiscountAmount: pesewasSchema.optional(),
  cartDiscountReason: z.string().optional(),
  payments: z.array(paymentInputSchema).min(1, 'At least one payment is required.'),
  managerOverride: managerOverrideSchema.optional(),
  deviceId: z.string().optional(),
});
export type CreateSaleBody = z.infer<typeof createSaleBodySchema>;

export const saleIdParamsSchema = z.object({ id: z.string().min(1) });

const refundLineInputSchema = z.object({
  saleLineId: z.string().min(1),
  quantity: z.number().positive('Quantity must be greater than zero.'),
  // Doc 3 §5: "choose restock or write off as damaged" — per line.
  restock: z.boolean(),
});

export const createRefundBodySchema = z.object({
  id: z.string().min(1),
  lines: z.array(refundLineInputSchema).min(1, 'A refund needs at least one line.'),
  // How the refunded amount is given back — cash, reversed to the same
  // mobile money account, etc. Same enum as a sale's tender.
  method: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'ACCOUNT']),
  reason: z.string().min(1, 'A reason is required for a refund.'),
});
export type CreateRefundBody = z.infer<typeof createRefundBodySchema>;

const salesFilterSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  userId: z.string().min(1).optional(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'ACCOUNT']).optional(),
});
export type SalesFilter = z.infer<typeof salesFilterSchema>;

// Doc 3 App Flow §5: "History: a reverse-chronological list filterable
// by date, staff member, and payment method." Not one of T-19's own
// acceptance criteria, but there is no other way to find a sale to
// refund — a cashier is always scoped to their own sales in the
// service layer, never by trusting a client-supplied userId.
//
// Page-number pagination (not the cursor style used by T-07/T-13's
// mutable lists) is deliberate and safe here specifically: sales are an
// append-only, insert-at-the-head log ordered newest-first, so a fixed
// older page never shifts under concurrent writes the way a filtered,
// mutable product list could. That's what let T-07 rule offset out in
// the first place — the risk it exists to avoid just doesn't apply to
// a chronological history.
export const listSalesQuerySchema = salesFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;

export const salesStatsQuerySchema = salesFilterSchema;
export type SalesStatsQuery = z.infer<typeof salesStatsQuerySchema>;
