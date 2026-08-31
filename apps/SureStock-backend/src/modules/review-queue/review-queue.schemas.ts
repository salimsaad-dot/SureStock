import { z } from 'zod';

export const listReviewQueueQuerySchema = z.object({
  // Defaults to open items only — a review queue is meant to be worked
  // down to zero, not paged through as a permanent history (that's what
  // audit_log is for).
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListReviewQueueQuery = z.infer<typeof listReviewQueueQuerySchema>;

export const resolveReviewQueueItemBodySchema = z.object({
  note: z.string().min(1, 'A resolution note is required.'),
});
export type ResolveReviewQueueItemBody = z.infer<typeof resolveReviewQueueItemBodySchema>;

export const reviewQueueItemIdParamsSchema = z.object({ id: z.string().min(1) });
