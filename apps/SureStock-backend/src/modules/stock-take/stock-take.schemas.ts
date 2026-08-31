import { z } from 'zod';

// Doc 3 §4.2: "choose full shop or a category."
export const startStockTakeBodySchema = z
  .object({
    scope: z.enum(['FULL', 'CATEGORY']),
    categoryId: z.string().min(1).optional(),
  })
  .refine((b) => b.scope !== 'CATEGORY' || b.categoryId, {
    message: 'categoryId is required when scope is CATEGORY.',
    path: ['categoryId'],
  });
export type StartStockTakeBody = z.infer<typeof startStockTakeBodySchema>;

export const stockTakeIdParamsSchema = z.object({ id: z.string().min(1) });
export const stockTakeLineParamsSchema = z.object({ id: z.string().min(1), lineId: z.string().min(1) });

// Doc 3 §4.2: "a count list... item name, a big number field, and next"
// — a count is entered one line at a time, saved to the server
// immediately (T-27: "progress survives interruption"), so at least one
// of the two is required on every call, but never both omitted.
export const updateStockTakeLineBodySchema = z
  .object({
    countedQuantity: z.number().nonnegative().optional(),
    reason: z.string().min(1).optional(),
  })
  .refine((b) => b.countedQuantity !== undefined || b.reason !== undefined, {
    message: 'Provide a counted quantity and/or a reason.',
  });
export type UpdateStockTakeLineBody = z.infer<typeof updateStockTakeLineBodySchema>;

export const listStockTakesQuerySchema = z.object({
  status: z.enum(['IN_PROGRESS', 'POSTED', 'ABANDONED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type ListStockTakesQuery = z.infer<typeof listStockTakesQuerySchema>;

// A launch-scale catalogue (Doc 5/Blueprint §05: "roughly 500-3,000
// SKUs") comfortably fits in one response — the counting UI walks its
// lines one at a time client-side (Doc 3 §4.2's literal "one item, one
// big field, one Next"), which is far simpler than re-fetching a page
// on every Next tap. 5000 is a generous ceiling past that, not a
// browsable-list page size.
export const listStockTakeLinesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(5000).default(50),
});
export type ListStockTakeLinesQuery = z.infer<typeof listStockTakeLinesQuerySchema>;
