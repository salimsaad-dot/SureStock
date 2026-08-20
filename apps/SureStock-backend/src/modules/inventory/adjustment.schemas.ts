import { z } from 'zod';

// A deliberate subset of MovementReason (Doc 6 T-12: "requires a reason
// code"): SALE/PURCHASE_RECEIVED/OPENING_BALANCE/REFUND/TRANSFER_* each
// already have their own dedicated writer (T-16, T-11, product creation,
// a future refund/transfer flow) — a manual adjustment exists precisely
// for the movements that don't, i.e. "why doesn't the count match."
export const adjustmentReasonSchema = z.enum(['DAMAGE', 'EXPIRY', 'THEFT', 'STOCK_TAKE_ADJUSTMENT']);
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;

export const createAdjustmentBodySchema = z
  .object({
    variantId: z.string().min(1),
    quantityDelta: z.number().refine((n) => n !== 0, 'Quantity delta cannot be zero.'),
    reasonCode: adjustmentReasonSchema,
    // Required, not optional — Doc 6 T-12: "requires a reason code and a
    // note." Damage/expiry/theft/a stock-take correction all deserve a
    // sentence explaining what actually happened, not just a code.
    note: z.string().min(1, 'A note is required for every adjustment.'),
  })
  .superRefine((body, ctx) => {
    // Damage, expiry, and theft are always a loss — a positive delta
    // under one of those reasons is a contradiction the schema can catch
    // instead of silently accepting "found 5 units of theft."
    // STOCK_TAKE_ADJUSTMENT is the one reason a genuine recount can go
    // either way (found more, or found less, than expected).
    if (body.reasonCode !== 'STOCK_TAKE_ADJUSTMENT' && body.quantityDelta > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantityDelta'],
        message: `${body.reasonCode} is always a loss — quantityDelta must be negative.`,
      });
    }
  });
export type CreateAdjustmentBody = z.infer<typeof createAdjustmentBodySchema>;
