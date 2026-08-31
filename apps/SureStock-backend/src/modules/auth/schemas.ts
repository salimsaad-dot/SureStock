import { z } from 'zod';

// "identifier" rather than separate email/phone fields: staff log in
// with whichever of the two they actually have (Doc 1's onboarding
// collects both but doesn't require either specifically), and both are
// unique columns, so a single lookup field is unambiguous either way.
export const loginBodySchema = z.object({
  identifier: z.string().min(1, 'Enter your phone number or email.'),
  password: z.string().min(1, 'Enter your password.'),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const pinUnlockBodySchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits.'),
});
export type PinUnlockBody = z.infer<typeof pinUnlockBodySchema>;

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

// Doc 3 §2, T-30 step 1: "Owner name, shop name, phone, email,
// password." SMS verification is named in the doc too but never
// buildable here — no SMS provider exists anywhere in this project
// (same honest, repeatedly-documented gap as receipt delivery and
// staff-invite links).
export const registerBodySchema = z
  .object({
    shopName: z.string().min(1, 'Enter your shop name.'),
    ownerName: z.string().min(1, 'Enter your name.'),
    email: z.string().email('Enter a valid email.').optional(),
    phone: z.string().min(1).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
  })
  .refine((b) => b.email || b.phone, { message: 'Provide an email or phone number.', path: ['email'] });
export type RegisterBody = z.infer<typeof registerBodySchema>;
