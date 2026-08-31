import { z } from 'zod';

// Doc 6 T-31: "the audit log is searchable by user, action, and date."
export const listAuditLogQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;
