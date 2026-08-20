import { z } from 'zod';

// Money fields are integer pesewas (Doc 2 §3.3) — see product.schemas.ts.
const pesewasSchema = z.number().int().nonnegative();

const receiveLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().positive('Quantity received must be greater than zero.'),
  unitCost: pesewasSchema,
  // Doc 6 T-11: "batch and expiry captured for perishables." Accepted for
  // any variant, but only meaningful (and only actually stored as a
  // Batch row) when the product is perishable — see receive.service.ts.
  batchCode: z.string().min(1).max(191).optional(),
  expiryDate: z.coerce.date().optional(),
  note: z.string().optional(),
});
export type ReceiveLine = z.infer<typeof receiveLineSchema>;

export const receiveStockBodySchema = z.object({
  supplierId: z.string().min(1).optional(),
  lines: z.array(receiveLineSchema).min(1, 'At least one line is required.'),
});
export type ReceiveStockBody = z.infer<typeof receiveStockBodySchema>;
