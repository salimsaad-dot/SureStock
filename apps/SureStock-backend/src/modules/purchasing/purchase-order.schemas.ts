import { z } from 'zod';

// Money fields are integer pesewas (Doc 2 §3.3) — see lib/money.ts.
const pesewasSchema = z.number().int().nonnegative();

const purchaseOrderLineInputSchema = z.object({
  variantId: z.string().min(1),
  quantityOrdered: z.number().positive('Quantity ordered must be greater than zero.'),
  unitCost: pesewasSchema,
});
export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineInputSchema>;

export const createPurchaseOrderBodySchema = z.object({
  supplierId: z.string().min(1),
  expectedDate: z.coerce.date().optional(),
  lines: z.array(purchaseOrderLineInputSchema).min(1, 'At least one line is required.'),
});
export type CreatePurchaseOrderBody = z.infer<typeof createPurchaseOrderBodySchema>;

// A PO can only be edited while still DRAFT (enforced in the service,
// not here) — editing replaces the whole line set, same "replace, don't
// patch individual lines" shape as the create body, so the client never
// has to diff its own edits against what the server currently has.
export const updatePurchaseOrderBodySchema = createPurchaseOrderBodySchema;
export type UpdatePurchaseOrderBody = z.infer<typeof updatePurchaseOrderBodySchema>;

export const purchaseOrderIdParamsSchema = z.object({ id: z.string().min(1) });

const receivePurchaseOrderLineSchema = z.object({
  lineId: z.string().min(1),
  quantityReceived: z.number().positive('Quantity received must be greater than zero.'),
  // Optional override of the line's ordered unit cost — a real delivery
  // sometimes arrives at a different price than what was ordered.
  // Defaults to the line's own unitCost when omitted.
  unitCost: pesewasSchema.optional(),
  batchCode: z.string().min(1).max(191).optional(),
  expiryDate: z.coerce.date().optional(),
});
export const receivePurchaseOrderBodySchema = z.object({
  lines: z.array(receivePurchaseOrderLineSchema).min(1, 'At least one line is required.'),
});
export type ReceivePurchaseOrderBody = z.infer<typeof receivePurchaseOrderBodySchema>;

const purchaseOrderStatusEnum = z.enum(['DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED']);

export const listPurchaseOrdersQuerySchema = z.object({
  status: purchaseOrderStatusEnum.optional(),
  supplierId: z.string().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;

// Stats defaults to a trailing 30-day "This period" window when omitted
// (the mockup's Purchasing screen has no page-wide date picker the way
// Reports does), mirroring GET /sales/stats' own trailing-window default.
export const purchaseOrderStatsQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
export type PurchaseOrderStatsQuery = z.infer<typeof purchaseOrderStatsQuerySchema>;
