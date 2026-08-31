import { z } from 'zod';

const roleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER']);
const pinSchema = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits.');

export const createStaffBodySchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    pin: pinSchema.optional(),
    role: roleSchema,
  })
  .refine((b) => b.email || b.phone, { message: 'At least one of email or phone is required.', path: ['email'] });
export type CreateStaffBody = z.infer<typeof createStaffBodySchema>;

export const updateStaffBodySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().min(1).nullable().optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;

export const resetCredentialsBodySchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.').optional(),
    pin: pinSchema.optional(),
  })
  .refine((b) => b.password || b.pin, { message: 'Provide a new password and/or PIN.' });
export type ResetCredentialsBody = z.infer<typeof resetCredentialsBodySchema>;

export const staffIdParamsSchema = z.object({ id: z.string().min(1) });
