import { z } from 'zod';

const pesewasSchema = z.number().int().nonnegative();

export const openTillShiftBodySchema = z.object({
  openingFloat: pesewasSchema,
});
export type OpenTillShiftBody = z.infer<typeof openTillShiftBodySchema>;

export const closeTillShiftBodySchema = z.object({
  countedCash: pesewasSchema,
  notes: z.string().optional(),
});
export type CloseTillShiftBody = z.infer<typeof closeTillShiftBodySchema>;

export const tillShiftIdParamsSchema = z.object({ id: z.string().min(1) });

// Doc 3 App Flow §5: till shifts belong on the same Sales screen as
// transaction history. Page-number pagination for the same reason as
// sales' own list: a shift is opened once, closed at most once, and
// then never touched again, so a fixed older page is stable under
// concurrent writes the way offset pagination needs it to be.
export const listTillShiftsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  userId: z.string().min(1).optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});
export type ListTillShiftsQuery = z.infer<typeof listTillShiftsQuerySchema>;
