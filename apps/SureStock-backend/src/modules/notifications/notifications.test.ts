import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { postMovement } from '../inventory/movement.service.js';

const OWNER_PASSWORD = 'owner-password-notifications-test';
const MANAGER_PASSWORD = 'manager-password-notifications-test';
const CASHIER_PASSWORD = 'cashier-password-notifications-test';

/**
 * Every real trigger (sale, adjustment, till close, stock take) fires its
 * notification *after* its own transaction commits, deliberately not
 * awaited before the HTTP response is sent (see notification.service.ts's
 * own doc comment — an SMS call must never hold a request, let alone a
 * row lock, open). That makes the actual database write genuinely
 * asynchronous relative to the request that triggered it, so proving the
 * wiring (not just the isolated function) needs a short poll rather than
 * a synchronous assertion right after `app.inject()` returns.
 */
async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 2000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await check();
    if (result !== null) return result;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('notifications (SMS, Settings -> Notifications tab)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;
  let ownerToken: string;
  let managerToken: string;
  let cashierId: string;
  let cashierToken: string;

  async function createVariantWithStock(sku: string, quantity: number, reorderPoint: number | null) {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: `Notifications Test ${sku}` } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku, costPrice: 100, sellingPrice: 200, quantityOnHand: 0, reorderPoint, locationId },
    });
    if (quantity !== 0) {
      await app.prisma.$transaction((tx) =>
        postMovement(tx, { variantId: variant.id, quantityDelta: quantity, reason: 'OPENING_BALANCE', userId: ownerId }),
      );
    }
    return variant;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Notifications Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    async function makeUser(role: 'OWNER' | 'MANAGER' | 'CASHIER', password: string) {
      const id = generateId();
      const email = `notif-${role.toLowerCase()}-${runSuffix.slice(-8)}@test.surestock.local`;
      await app.prisma.user.create({ data: { id, name: `Notif ${role}`, email, passwordHash: await hashPassword(password), role, locationId } });
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password } });
      return { id, token: res.json().accessToken as string };
    }
    const owner = await makeUser('OWNER', OWNER_PASSWORD);
    ownerId = owner.id;
    ownerToken = owner.token;
    managerToken = (await makeUser('MANAGER', MANAGER_PASSWORD)).token;
    const cashier = await makeUser('CASHIER', CASHIER_PASSWORD);
    cashierId = cashier.id;
    cashierToken = cashier.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a fresh location has every alert off and no phone number configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings/business', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.json()).toMatchObject({
      notifyLowStockEnabled: false,
      notifyTillVarianceEnabled: false,
      notifyDailySummaryEnabled: false,
      notificationPhone: null,
    });
  });

  it('the owner can turn on alert types and set an alert phone number, distinct from the shop\'s own contact phone', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        phone: '+233200000000', // the shop's own public contact number
        notificationPhone: '+233555000111', // deliberately different — who gets paged
        notifyLowStockEnabled: true,
        notifyTillVarianceEnabled: true,
        notifyDailySummaryEnabled: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      phone: '+233200000000',
      notificationPhone: '+233555000111',
      notifyLowStockEnabled: true,
      notifyTillVarianceEnabled: true,
      notifyDailySummaryEnabled: true,
    });
  });

  it('POST /notifications/test always logs a real attempt, NOT_CONFIGURED here since no AFRICASTALKING_API_KEY is set in this test environment', async () => {
    const res = await app.inject({ method: 'POST', url: '/notifications/test', headers: { authorization: `Bearer ${managerToken}` } });
    expect(res.statusCode).toBe(200);

    const log = await app.prisma.notificationLog.findFirstOrThrow({ where: { locationId, type: 'TEST' }, orderBy: { createdAt: 'desc' } });
    expect(log.status).toBe('NOT_CONFIGURED'); // a real phone number IS configured (previous test) — it's the missing provider key that short-circuits this
    expect(log.recipientPhone).toBe('+233555000111');
  });

  it('a cashier cannot send a test SMS or read the notification log', async () => {
    const send = await app.inject({ method: 'POST', url: '/notifications/test', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(send.statusCode).toBe(403);
    const read = await app.inject({ method: 'GET', url: '/notifications/log', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(read.statusCode).toBe(403);
  });

  it('POST /notifications/daily-summary is rejected while the toggle is off, and logs a real attempt once it is on', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { notifyDailySummaryEnabled: false },
    });
    const rejected = await app.inject({ method: 'POST', url: '/notifications/daily-summary', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(rejected.statusCode).toBe(409);

    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { notifyDailySummaryEnabled: true },
    });
    const sent = await app.inject({ method: 'POST', url: '/notifications/daily-summary', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(sent.statusCode).toBe(200);

    const log = await app.prisma.notificationLog.findFirstOrThrow({ where: { locationId, type: 'DAILY_SUMMARY' }, orderBy: { createdAt: 'desc' } });
    expect(log.recipientPhone).toBe('+233555000111');
    expect(log.message).toMatch(/sale\(s\)/);
  });

  it('GET /notifications/log returns the most recent attempts first', async () => {
    const res = await app.inject({ method: 'GET', url: '/notifications/log', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as Array<{ createdAt: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const timestamps = rows.map((r) => new Date(r.createdAt).getTime());
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });

  it('a sale that pushes a variant to or below its reorder point fires a real LOW_STOCK notification attempt', async () => {
    const variant = await createVariantWithStock('NOTIF-LOWSTOCK-001', 10, 5);
    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${cashierToken}` }, payload: { openingFloat: 0 } });

    const sale = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 6 }], // 10 -> 4, crosses the reorder point of 5
        payments: [{ method: 'CASH', amount: 120000 }], // 6 units at sellingPrice GH₵200 (a Decimal cedis value, not pesewas)
      },
    });
    expect(sale.statusCode).toBe(201);

    const log = await waitFor(() =>
      app.prisma.notificationLog.findFirst({ where: { locationId, type: 'LOW_STOCK', message: { contains: variant.sku } }, orderBy: { createdAt: 'desc' } }),
    );
    expect(log.message).toContain('4 left');
    expect(log.message).toContain('reorder at 5');

    // Close the till shift again so it doesn't leak into a later test in this file.
    const shift = await app.prisma.tillShift.findFirstOrThrow({ where: { userId: cashierId, closedAt: null } });
    await app.inject({ method: 'POST', url: `/till-shifts/${shift.id}/close`, headers: { authorization: `Bearer ${cashierToken}` }, payload: { countedCash: 120000 } });
  });

  it('a sale that keeps a variant above its reorder point never fires a LOW_STOCK attempt for it', async () => {
    const variant = await createVariantWithStock('NOTIF-NOLOWSTOCK-001', 100, 5);
    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${cashierToken}` }, payload: { openingFloat: 0 } });

    const sale = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 20000 }] },
    });
    expect(sale.statusCode).toBe(201);

    await new Promise((r) => setTimeout(r, 150)); // let any fire-and-forget work that would have run actually run
    const log = await app.prisma.notificationLog.findFirst({ where: { locationId, type: 'LOW_STOCK', message: { contains: variant.sku } } });
    expect(log).toBeNull();

    const shift = await app.prisma.tillShift.findFirstOrThrow({ where: { userId: cashierId, closedAt: null } });
    await app.inject({ method: 'POST', url: `/till-shifts/${shift.id}/close`, headers: { authorization: `Bearer ${cashierToken}` }, payload: { countedCash: 20000 } });
  });

  it('closing a till past the variance threshold fires a real TILL_VARIANCE notification attempt alongside the existing audit-log entry', async () => {
    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${cashierToken}` }, payload: { openingFloat: 0 } });
    const shift = await app.prisma.tillShift.findFirstOrThrow({ where: { userId: cashierId, closedAt: null } });

    // Default variance threshold is GH₵20 (2000 pesewas) — counting GH₵50 against an expected GH₵0 float is comfortably past it.
    const close = await app.inject({
      method: 'POST',
      url: `/till-shifts/${shift.id}/close`,
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { countedCash: 5000 },
    });
    expect(close.statusCode).toBe(200);

    const audit = await app.prisma.auditLog.findFirstOrThrow({ where: { entityType: 'till_shift', entityId: shift.id, action: 'TILL_VARIANCE_ALERT' } });
    expect(audit).toBeTruthy();

    const log = await waitFor(() => app.prisma.notificationLog.findFirst({ where: { locationId, type: 'TILL_VARIANCE' }, orderBy: { createdAt: 'desc' } }));
    expect(log.message).toContain('over');
    expect(log.recipientPhone).toBe('+233555000111');
  });

  it('an adjustment that pushes a variant to or below its reorder point fires a real LOW_STOCK notification attempt', async () => {
    const variant = await createVariantWithStock('NOTIF-ADJ-LOWSTOCK-001', 10, 5);

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { variantId: variant.id, quantityDelta: -6, reasonCode: 'DAMAGE', note: 'Notifications wiring test' }, // 10 -> 4
    });
    expect(res.statusCode).toBe(201);

    const log = await waitFor(() =>
      app.prisma.notificationLog.findFirst({ where: { locationId, type: 'LOW_STOCK', message: { contains: variant.sku } }, orderBy: { createdAt: 'desc' } }),
    );
    expect(log.message).toContain('4 left');
  });

  it('disabling low-stock alerts means a real crossing no longer fires anything', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { notifyLowStockEnabled: false },
    });

    const variant = await createVariantWithStock('NOTIF-DISABLED-001', 10, 5);
    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { variantId: variant.id, quantityDelta: -6, reasonCode: 'DAMAGE', note: 'Should not notify — toggle is off' },
    });
    expect(res.statusCode).toBe(201);

    await new Promise((r) => setTimeout(r, 150));
    const log = await app.prisma.notificationLog.findFirst({ where: { locationId, type: 'LOW_STOCK', message: { contains: variant.sku } } });
    expect(log).toBeNull();
  });
});
