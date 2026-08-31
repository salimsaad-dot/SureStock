import type { Location } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { toPesewas, toDecimal } from '../../lib/money.js';
import { HttpError } from '../../lib/http-error.js';
import type { UpdateLocationSettingsBody } from './location-settings.schemas.js';

function conflict(message: string): HttpError {
  return new HttpError(409, 'CONFLICT', message);
}

function serializeLocationSettings(loc: Location) {
  return {
    id: loc.id,
    name: loc.name,
    address: loc.address,
    phone: loc.phone,
    email: loc.email,
    logoUrl: loc.logoUrl,
    receiptHeader: loc.receiptHeader,
    receiptFooter: loc.receiptFooter,
    currency: loc.currency,
    timezone: loc.timezone,
    defaultTaxRateId: loc.defaultTaxRateId,
    discountOverrideThresholdPercent: loc.discountOverrideThresholdPercent.toNumber(),
    tillVarianceThreshold: toPesewas(loc.tillVarianceThreshold),
    pinLockoutAttempts: loc.pinLockoutAttempts,
    pinLockoutMinutes: loc.pinLockoutMinutes,
    cashEnabled: loc.cashEnabled,
    mobileMoneyEnabled: loc.mobileMoneyEnabled,
    cardEnabled: loc.cardEnabled,
    accountEnabled: loc.accountEnabled,
    defaultReorderPoint: loc.defaultReorderPoint?.toNumber() ?? null,
    defaultReorderQuantity: loc.defaultReorderQuantity?.toNumber() ?? null,
    notifyLowStockEnabled: loc.notifyLowStockEnabled,
    notifyTillVarianceEnabled: loc.notifyTillVarianceEnabled,
    notifyDailySummaryEnabled: loc.notifyDailySummaryEnabled,
    notificationPhone: loc.notificationPhone,
    createdAt: loc.createdAt,
    updatedAt: loc.updatedAt,
  };
}

/** Owner-only (matches the Settings page's own route gate). Everything the Business Profile / Sales & POS / Security / Payment Methods / Inventory tabs read. */
export async function getLocationSettings(prisma: typeof PrismaClient, locationId: string) {
  const loc = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
  return serializeLocationSettings(loc);
}

/**
 * A narrow, cashier-safe subset — the Sell screen's payment sheet needs
 * to know which tender types are enabled (Doc 3/mockup's Payment
 * Methods tab) *and* the discount-override threshold (to decide whether
 * to show the manager-approval flow before charging), without exposing
 * the rest of `Location`'s owner-only fields (security policy, receipt
 * settings, etc.). The threshold itself isn't sensitive the way cost/
 * margin data is — a cashier already discovers it experientially the
 * first time a discount trips the override flow.
 */
export async function getCheckoutSettings(prisma: typeof PrismaClient, locationId: string) {
  const loc = await prisma.location.findUniqueOrThrow({
    where: { id: locationId },
    select: {
      cashEnabled: true,
      mobileMoneyEnabled: true,
      cardEnabled: true,
      accountEnabled: true,
      discountOverrideThresholdPercent: true,
    },
  });
  return { ...loc, discountOverrideThresholdPercent: loc.discountOverrideThresholdPercent.toNumber() };
}

/**
 * Another narrow, role-scoped subset, same reasoning as
 * `getCheckoutSettings` — `NewProductPage` (T-06) is reachable by
 * Manager as well as Owner, but the full `Location` row is Owner-only,
 * so a Manager creating a product still needs a way to read just the
 * Inventory tab's default reorder point/quantity.
 */
export async function getInventoryDefaults(prisma: typeof PrismaClient, locationId: string) {
  const loc = await prisma.location.findUniqueOrThrow({
    where: { id: locationId },
    select: { defaultReorderPoint: true, defaultReorderQuantity: true },
  });
  return {
    defaultReorderPoint: loc.defaultReorderPoint?.toNumber() ?? null,
    defaultReorderQuantity: loc.defaultReorderQuantity?.toNumber() ?? null,
  };
}

export async function updateLocationSettings(prisma: typeof PrismaClient, locationId: string, body: UpdateLocationSettingsBody) {
  const existing = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
  const merged = {
    cashEnabled: body.cashEnabled ?? existing.cashEnabled,
    mobileMoneyEnabled: body.mobileMoneyEnabled ?? existing.mobileMoneyEnabled,
    cardEnabled: body.cardEnabled ?? existing.cardEnabled,
    accountEnabled: body.accountEnabled ?? existing.accountEnabled,
  };
  if (!merged.cashEnabled && !merged.mobileMoneyEnabled && !merged.cardEnabled && !merged.accountEnabled) {
    throw conflict('At least one payment method must stay enabled — the till would have no way to take payment.');
  }

  const updated = await prisma.location.update({
    where: { id: locationId },
    data: {
      ...body,
      tillVarianceThreshold: body.tillVarianceThreshold !== undefined ? toDecimal(body.tillVarianceThreshold) : undefined,
    },
  });
  return serializeLocationSettings(updated);
}
