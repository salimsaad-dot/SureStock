import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const OWNER_PASSWORD = 'owner-password-review-queue-test';
const MANAGER_PASSWORD = 'manager-password-review-queue-test';
const CASHIER_PASSWORD = 'cashier-password-review-queue-test';

describe('review queue (T-23)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Review Queue Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    async function makeUser(role: 'OWNER' | 'MANAGER' | 'CASHIER', password: string) {
      const id = generateId();
      const email = `review-queue-${role.toLowerCase()}-${runSuffix.slice(-8)}@test.surestock.local`;
      await app.prisma.user.create({ data: { id, name: `Review Queue ${role}`, email, passwordHash: await hashPassword(password), role, locationId } });
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password } });
      return res.json().accessToken as string;
    }
    ownerToken = await makeUser('OWNER', OWNER_PASSWORD);
    managerToken = await makeUser('MANAGER', MANAGER_PASSWORD);
    cashierToken = await makeUser('CASHIER', CASHIER_PASSWORD);

    // Seed via a real offline sync, not a direct DB insert — the point
    // of this suite is verifying the API surface over whatever
    // sync.service.ts actually produces.
    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${cashierToken}` }, payload: { openingFloat: 0 } });
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Review Queue Seed Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `REVIEW-SEED-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 1, quantityOnHand: 1, locationId },
    });
    await app.inject({
      method: 'POST',
      url: '/sync/batch',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { sales: [{ id: generateId(), lines: [{ variantId: variant.id, quantity: 3 }], payments: [{ method: 'CASH', amount: 300 }] }] },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('a cashier cannot list or resolve review-queue items', async () => {
    const list = await app.inject({ method: 'GET', url: '/review-queue', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(list.statusCode).toBe(403);
  });

  it('defaults to open items only, and a manager can see the negative-stock item seeded above', async () => {
    const res = await app.inject({ method: 'GET', url: '/review-queue', headers: { authorization: `Bearer ${managerToken}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.every((i: { resolvedAt: string | null }) => i.resolvedAt === null)).toBe(true);
    expect(body.items[0]).toMatchObject({ type: 'NEGATIVE_STOCK' });
    expect(body.items[0].saleReceiptNumber).toMatch(/^RCT-/);
  });

  it('resolves an item, which then disappears from the open list and appears in resolved', async () => {
    const before = await app.inject({ method: 'GET', url: '/review-queue', headers: { authorization: `Bearer ${ownerToken}` } });
    const itemId = before.json().items[0].id;

    const resolve = await app.inject({
      method: 'POST',
      url: `/review-queue/${itemId}/resolve`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { note: 'Confirmed with the cashier — real stock take needed, adjustment posted.' },
    });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json()).toMatchObject({ id: itemId, resolutionNote: expect.stringContaining('stock take') });
    expect(resolve.json().resolvedByName).toBeTruthy();

    const openAfter = await app.inject({ method: 'GET', url: '/review-queue', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(openAfter.json().items.some((i: { id: string }) => i.id === itemId)).toBe(false);

    const resolvedList = await app.inject({ method: 'GET', url: '/review-queue?status=resolved', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(resolvedList.json().items.some((i: { id: string }) => i.id === itemId)).toBe(true);
  });

  it('resolving an already-resolved item is rejected', async () => {
    const resolved = await app.inject({ method: 'GET', url: '/review-queue?status=resolved', headers: { authorization: `Bearer ${ownerToken}` } });
    const itemId = resolved.json().items[0].id;

    const again = await app.inject({
      method: 'POST',
      url: `/review-queue/${itemId}/resolve`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { note: 'Trying again.' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('resolving an unknown item is a 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/review-queue/${generateId()}/resolve`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { note: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});
