import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { hashSecret } from '../../lib/hash.js';

const OWNER_PASSWORD = 'owner-password-settings-test';
const MANAGER_PASSWORD = 'manager-password-settings-test';
const CASHIER_PASSWORD = 'cashier-password-settings-test';

describe('location settings (T-29)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Settings Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    async function makeUser(role: 'OWNER' | 'MANAGER' | 'CASHIER', password: string) {
      const id = generateId();
      const email = `settings-${role.toLowerCase()}-${runSuffix.slice(-8)}@test.surestock.local`;
      await app.prisma.user.create({ data: { id, name: `Settings ${role}`, email, passwordHash: await hashPassword(password), role, locationId } });
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password } });
      return res.json().accessToken as string;
    }
    ownerToken = await makeUser('OWNER', OWNER_PASSWORD);
    managerToken = await makeUser('MANAGER', MANAGER_PASSWORD);
    cashierToken = await makeUser('CASHIER', CASHIER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a fresh location starts with the documented defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings/business', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      discountOverrideThresholdPercent: 10,
      tillVarianceThreshold: 2000,
      pinLockoutAttempts: 5,
      pinLockoutMinutes: 5,
      cashEnabled: true,
      mobileMoneyEnabled: true,
      cardEnabled: true,
      accountEnabled: true,
      defaultReorderPoint: null,
      defaultReorderQuantity: null,
    });
  });

  it('a manager or cashier cannot read or write business settings', async () => {
    const getManager = await app.inject({ method: 'GET', url: '/settings/business', headers: { authorization: `Bearer ${managerToken}` } });
    expect(getManager.statusCode).toBe(403);
    const getCashier = await app.inject({ method: 'GET', url: '/settings/business', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(getCashier.statusCode).toBe(403);
    const patch = await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { name: 'Hacked Name' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('the owner can update business profile fields and thresholds', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        email: 'shop@settings-test.local',
        logoUrl: 'https://example.com/logo.png',
        discountOverrideThresholdPercent: 15,
        tillVarianceThreshold: 3000,
        pinLockoutAttempts: 3,
        pinLockoutMinutes: 10,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      email: 'shop@settings-test.local',
      logoUrl: 'https://example.com/logo.png',
      discountOverrideThresholdPercent: 15,
      tillVarianceThreshold: 3000,
      pinLockoutAttempts: 3,
      pinLockoutMinutes: 10,
    });

    // Restore the defaults — later tests in this file assert against them directly.
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { discountOverrideThresholdPercent: 10, tillVarianceThreshold: 2000, pinLockoutAttempts: 5, pinLockoutMinutes: 5 },
    });
  });

  it('disabling every payment method at once is rejected', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { cashEnabled: false, mobileMoneyEnabled: false, cardEnabled: false, accountEnabled: false },
    });
    expect(res.statusCode).toBe(409);
  });

  it('disabling all but one method is allowed, and a cashier can read the resulting checkout-settings subset', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { mobileMoneyEnabled: false, cardEnabled: false, accountEnabled: false },
    });
    expect(patch.statusCode).toBe(200);

    const cashierRead = await app.inject({ method: 'GET', url: '/settings/checkout', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(cashierRead.statusCode).toBe(200);
    expect(cashierRead.json()).toEqual({
      cashEnabled: true,
      mobileMoneyEnabled: false,
      cardEnabled: false,
      accountEnabled: false,
      discountOverrideThresholdPercent: 10,
    });

    // restore for later tests
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { mobileMoneyEnabled: true, cardEnabled: true, accountEnabled: true },
    });
  });

  it('a manager (not just the owner) can read inventory defaults — NewProductPage is reachable by both roles', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { defaultReorderPoint: 12, defaultReorderQuantity: 24 },
    });

    const managerRead = await app.inject({ method: 'GET', url: '/settings/inventory-defaults', headers: { authorization: `Bearer ${managerToken}` } });
    expect(managerRead.statusCode).toBe(200);
    expect(managerRead.json()).toEqual({ defaultReorderPoint: 12, defaultReorderQuantity: 24 });

    const cashierRead = await app.inject({ method: 'GET', url: '/settings/inventory-defaults', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(cashierRead.statusCode).toBe(403);
  });

  it('the discount-override threshold set here is the real value sale.service.ts enforces, not a hardcoded constant', async () => {
    // Lower the threshold to 5% so a 10% discount (previously fine at the old 10% default) now requires an override.
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { discountOverrideThresholdPercent: 5 },
    });

    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Settings Wiring Test Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SETTINGS-WIRE-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 100, quantityOnHand: 50, locationId },
    });
    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${cashierToken}` }, payload: { openingFloat: 0 } });

    const sale = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1, discountAmount: 10 }], // 10% of a 100-pesewa line — over the new 5% threshold
        payments: [{ method: 'CASH', amount: 90 }],
      },
    });
    expect(sale.statusCode).toBe(400); // missing managerOverride, exactly because the real (lowered) threshold was exceeded

    // restore the default for later tests
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { discountOverrideThresholdPercent: 10 },
    });
  });

  it('the PIN lockout attempts/minutes set here are the real values auth/service.ts enforces', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { pinLockoutAttempts: 2, pinLockoutMinutes: 1 },
    });

    const id = generateId();
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id,
        name: 'PIN Lockout Wiring Test',
        email: `pin-wiring-${runSuffix.slice(-8)}@test.surestock.local`,
        passwordHash: await hashPassword('irrelevant-not-used-1234'),
        pinHash: await hashSecret('9999'),
        role: 'CASHIER',
        locationId,
      },
    });

    const first = await app.inject({ method: 'POST', url: '/auth/pin-unlock', payload: { userId: id, pin: '0000' } });
    expect(first.statusCode).toBe(401);
    const second = await app.inject({ method: 'POST', url: '/auth/pin-unlock', payload: { userId: id, pin: '0000' } });
    // Locks on the 2nd wrong attempt now, not the 5th default — proves the real per-location value is what's enforced.
    expect(second.statusCode).toBe(423);

    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { pinLockoutAttempts: 5, pinLockoutMinutes: 5 },
    });
  });
});
