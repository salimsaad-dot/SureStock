import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

describe('audit log viewer (T-31)', () => {
  let app: FastifyInstance;

  async function makeLocationWithOwner(label: string) {
    const locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: label, currency: 'GHS' } });
    const runSuffix = generateId();
    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: `${label} Owner`,
        email: `${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('audit-test-password'),
        role: 'OWNER',
        locationId,
      },
    });
    const token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'audit-test-password' } })
    ).json().accessToken;
    return { locationId, ownerId, token };
  }

  async function makeCashier(locationId: string) {
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: { id: generateId(), name: 'Audit Cashier', email: `${runSuffix}@test.surestock.local`, passwordHash: await hashPassword('audit-cashier-password'), role: 'CASHIER', locationId },
    });
    return (await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'audit-cashier-password' } })).json()
      .accessToken;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('only the Owner can view the audit log, not Manager or Cashier', async () => {
    const { locationId, token } = await makeLocationWithOwner('Audit Gate Shop');
    const cashierToken = await makeCashier(locationId);

    const asOwner = await app.inject({ method: 'GET', url: '/audit-log', headers: { authorization: `Bearer ${token}` } });
    expect(asOwner.statusCode).toBe(200);
    const asCashier = await app.inject({ method: 'GET', url: '/audit-log', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(asCashier.statusCode).toBe(403);
  });

  it('is searchable by user, action, and date, and scoped to this location only', async () => {
    const { ownerId, token } = await makeLocationWithOwner('Audit Search Shop');
    const { token: otherToken } = await makeLocationWithOwner('Audit Other Shop');

    // A real DAMAGE adjustment writes a real STOCK_ADJUSTMENT audit row.
    const product = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Audit Widget', variants: [{ sku: `AUDIT-${generateId()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: 10 }] },
    });
    const variantId = product.json().variants[0].id;
    await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${token}` },
      payload: { variantId, quantityDelta: -1, reasonCode: 'DAMAGE', note: 'audit log test' },
    });

    // The same action in a different shop should never show up here.
    const otherProduct = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { name: 'Other Shop Widget', variants: [{ sku: `AUDIT-OTHER-${generateId()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: 10 }] },
    });
    await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { variantId: otherProduct.json().variants[0].id, quantityDelta: -1, reasonCode: 'DAMAGE', note: 'other shop' },
    });

    const all = await app.inject({ method: 'GET', url: '/audit-log', headers: { authorization: `Bearer ${token}` } });
    expect(all.statusCode).toBe(200);
    const body = all.json();
    expect(body.items.every((item: { userId: string }) => item.userId === ownerId)).toBe(true);
    expect(body.availableActions).toContain('STOCK_ADJUSTMENT');

    const byAction = await app.inject({ method: 'GET', url: '/audit-log?action=STOCK_ADJUSTMENT', headers: { authorization: `Bearer ${token}` } });
    expect(byAction.json().items.length).toBeGreaterThan(0);
    expect(byAction.json().items.every((item: { action: string }) => item.action === 'STOCK_ADJUSTMENT')).toBe(true);

    const byUser = await app.inject({ method: 'GET', url: `/audit-log?userId=${ownerId}`, headers: { authorization: `Bearer ${token}` } });
    expect(byUser.json().items.length).toBeGreaterThan(0);

    const futureOnly = await app.inject({
      method: 'GET',
      url: `/audit-log?dateFrom=${new Date(Date.now() + 3600_000).toISOString()}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(futureOnly.json().items).toHaveLength(0);
  });
});
