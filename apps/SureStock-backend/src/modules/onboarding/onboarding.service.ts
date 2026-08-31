import type { prisma as PrismaClient } from '../../lib/prisma.js';

export type OnboardingStepKey = 'SHOP_PROFILE' | 'CATEGORIES' | 'PRODUCTS' | 'OPENING_STOCK' | 'INVITE_STAFF' | 'HARDWARE_TEST';

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  done: boolean;
  /** Whether this step counts toward `isComplete` below — see the doc comment on getOnboardingStatus() for why two of the six don't. */
  required: boolean;
  linkPath: string;
}

/**
 * Doc 3 §2 / T-30: "each step is skippable and resumable; a progress
 * checklist stays on the dashboard until it is complete... the
 * checklist clears only when genuinely complete." Every step's status
 * is derived live from real data — no separate stored checklist to
 * drift out of sync with what's actually true, same "ledger truth over
 * a cached flag" reasoning as everywhere else in this codebase (no
 * daily_summary rollup, till variance always recomputed live, etc.).
 *
 * One of the six steps is shown but deliberately excluded from
 * `isComplete`:
 * - HARDWARE_TEST: testing a scanner / printing a test receipt has no
 *   durable server-side trace to check at all — it's presented as an
 *   always-available, always-optional action, matching Doc 3's own
 *   "each step is skippable." CATEGORIES used to be excluded too, for a
 *   real reason (`Category` had no `locationId`, so `count() > 0` would
 *   read as permanently "done" for every shop after the first real one)
 *   — closed 2026-08-25 alongside the wider T-30 isolation follow-up;
 *   `done` below is now a genuine per-shop signal. Still `required:
 *   false` on its own merits (a product can legitimately have no
 *   category), not because of the old data gap.
 *
 * The other five are scoped through columns that are genuinely
 * per-location (`Category.locationId`, `ProductVariant.locationId`,
 * `User.locationId`, `Location` itself).
 */
export async function getOnboardingStatus(prisma: typeof PrismaClient, locationId: string) {
  const [location, categoryCount, variantCount, stockedVariantCount, staffCount] = await Promise.all([
    prisma.location.findUniqueOrThrow({ where: { id: locationId }, select: { email: true } }),
    prisma.category.count({ where: { locationId } }),
    prisma.productVariant.count({ where: { locationId, archivedAt: null } }),
    prisma.productVariant.count({ where: { locationId, archivedAt: null, quantityOnHand: { gt: 0 } } }),
    prisma.user.count({ where: { locationId, role: { not: 'OWNER' } } }),
  ]);

  const steps: OnboardingStep[] = [
    { key: 'SHOP_PROFILE', label: 'Set up your shop profile', done: location.email !== null, required: true, linkPath: '/settings' },
    { key: 'CATEGORIES', label: 'Add categories', done: categoryCount > 0, required: false, linkPath: '/inventory/settings' },
    { key: 'PRODUCTS', label: 'Add your first products', done: variantCount > 0, required: true, linkPath: '/inventory/new' },
    { key: 'OPENING_STOCK', label: 'Opening stock not set', done: stockedVariantCount > 0, required: true, linkPath: '/inventory/stock-take' },
    { key: 'INVITE_STAFF', label: 'Invite your staff', done: staffCount > 0, required: true, linkPath: '/settings' },
    { key: 'HARDWARE_TEST', label: 'Test your barcode scanner and receipt printer', done: false, required: false, linkPath: '/onboarding' },
  ];

  return {
    steps,
    isComplete: steps.filter((s) => s.required).every((s) => s.done),
  };
}
