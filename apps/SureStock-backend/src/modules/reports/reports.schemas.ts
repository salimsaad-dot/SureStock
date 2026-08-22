import { z } from 'zod';

// Doc 1 §3.4 / mockup: the Reports screen always has an active date
// range (unlike the Sales history list, which stays unbounded by
// default so history can still be paged through indefinitely) — the
// client always sends one, so this isn't optional the way it is on
// GET /sales.
export const reportsFilterSchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  userId: z.string().min(1).optional(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'CARD', 'ACCOUNT']).optional(),
});
export type ReportsFilter = z.infer<typeof reportsFilterSchema>;

export const reportsProductsQuerySchema = reportsFilterSchema.extend({
  direction: z.enum(['top', 'low']).default('top'),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  // Only the product tables get a category filter — the page-wide
  // filter set is staff + payment method (a sale isn't scoped to one
  // category), matching what was actually asked for in scoping.
  categoryId: z.string().min(1).optional(),
});
export type ReportsProductsQuery = z.infer<typeof reportsProductsQuerySchema>;
