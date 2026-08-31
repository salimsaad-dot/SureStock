import { z } from 'zod';

// Money fields are integer pesewas (Doc 2 §3.3) — see lib/money.ts.
const pesewasSchema = z.number().int().nonnegative();

/**
 * One partial-update body across Business Profile, Sales & POS,
 * Security, Payment Methods, and Inventory — they're all just columns
 * on the same `Location` row (Doc 6 T-29: extending Location rather
 * than a new settings table), so one endpoint plus each tab's form only
 * submitting its own relevant subset is simpler than five near-identical
 * PATCH routes.
 */
export const updateLocationSettingsBodySchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  logoUrl: z.string().url().optional(),
  receiptHeader: z.string().optional(),
  receiptFooter: z.string().optional(),
  currency: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  discountOverrideThresholdPercent: z.number().min(0).max(100).optional(),
  tillVarianceThreshold: pesewasSchema.optional(),
  pinLockoutAttempts: z.number().int().min(1).max(20).optional(),
  pinLockoutMinutes: z.number().int().min(1).max(120).optional(),
  cashEnabled: z.boolean().optional(),
  mobileMoneyEnabled: z.boolean().optional(),
  cardEnabled: z.boolean().optional(),
  accountEnabled: z.boolean().optional(),
  defaultReorderPoint: z.number().nonnegative().optional(),
  defaultReorderQuantity: z.number().nonnegative().optional(),
  notifyLowStockEnabled: z.boolean().optional(),
  notifyTillVarianceEnabled: z.boolean().optional(),
  notifyDailySummaryEnabled: z.boolean().optional(),
  notificationPhone: z.string().optional(),
});
export type UpdateLocationSettingsBody = z.infer<typeof updateLocationSettingsBodySchema>;
