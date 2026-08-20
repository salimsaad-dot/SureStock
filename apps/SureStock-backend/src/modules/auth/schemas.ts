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
