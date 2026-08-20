import { z } from 'zod';

export const createSupplierBodySchema = z.object({
  name: z.string().min(1, 'Name is required.').max(191),
  contactName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  paymentTerms: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export type CreateSupplierBody = z.infer<typeof createSupplierBodySchema>;

export const updateSupplierBodySchema = createSupplierBodySchema.partial();
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;

export const supplierIdParamsSchema = z.object({
  id: z.string().min(1),
});
