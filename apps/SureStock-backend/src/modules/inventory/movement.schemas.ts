import { z } from 'zod';

export const movementReasonSchema = z.enum([
  'SALE',
  'REFUND',
  'PURCHASE_RECEIVED',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DAMAGE',
  'EXPIRY',
  'THEFT',
  'STOCK_TAKE_ADJUSTMENT',
  'OPENING_BALANCE',
]);

export const listMovementsQuerySchema = z.object({
  reason: movementReasonSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;

export const variantMovementsParamsSchema = z.object({
  id: z.string().min(1),
  variantId: z.string().min(1),
});
