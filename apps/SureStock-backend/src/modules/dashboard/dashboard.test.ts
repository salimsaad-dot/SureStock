import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

describe('dashboard (T-25)', () => {
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
        passwordHash: await hashPassword('dashboard-test-password'),
        role: 'OWNER',
        locationId,
      },
    });
    const token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'dashboard-test-password' } })
    ).json().accessToken;
    return { locationId, ownerId, token };
  }

  async function makeCashier(locationId: string, label: string) {
    const runSuffix = generateId();
    const id = generateId();
    await app.prisma.user.create({
      data: { id, name: label, email: `${runSuffix}@test.surestock.local`, passwordHash: await hashPassword('dashboard-cashier-password'), role: 'CASHIER', locationId },
    });
    const token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'dashboard-cashier-password' } })
    ).json().accessToken;
    return { id, token };
  }

  async function makeProduct(token: string, name: string, sku: string, sellingPrice: number, costPrice: number, openingQuantity = 100, reorderPoint?: number) {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { name, variants: [{ sku, costPrice, sellingPrice, openingQuantity, reorderPoint }] },
    });
    return { productId: res.json().id, variantId: res.json().variants[0].id };
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('only Manager/Owner can reach the dashboard, not Cashier', async () => {
    const { locationId, token: ownerToken } = await makeLocationWithOwner('Dashboard Gate Shop');
    const { token: cashierToken } = await makeCashier(locationId, 'Gate Cashier');

    const asOwner = await app.inject({ method: 'GET', url: '/dashboard', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(asOwner.statusCode).toBe(200);
    const asCashier = await app.inject({ method: 'GET', url: '/dashboard', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(asCashier.statusCode).toBe(403);
  });

  it("today's figures reflect real sales, with no fabricated comparison for a brand-new shop", async () => {
    const { token } = await makeLocationWithOwner('Dashboard Today Shop');
    const { variantId } = await makeProduct(token, 'Dashboard Widget', `DASH-${generateId()}`, 1000, 400, 50);

    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 0 } });
    const sale = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ variantId, quantity: 2 }], payments: [{ method: 'CASH', amount: 2000 }] },
    });
    expect(sale.statusCode).toBe(201);

    const res = await app.inject({ method: 'GET', url: '/dashboard', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.todayRevenue).toBe(2000);
    expect(body.todayTransactions).toBe(1);
    expect(body.todayGrossProfit).toBe(1200); // (1000-400)*2
    expect(body.todayRevenueChangePct).toBeNull(); // nothing happened "last week" for a fresh shop
    expect(body.topSellers.some((p: { variantId: string }) => p.variantId === variantId)).toBe(true);
    expect(body.trend.length).toBe(30);
    const today = new Date().toISOString().slice(0, 10);
    expect(body.trend.find((t: { date: string }) => t.date === today)?.totalSales).toBe(2000);
  });

  it('cash in drawer sums live, unclosed till shifts across every cashier at the location', async () => {
    const { token } = await makeLocationWithOwner('Dashboard Cash Shop');
    const { variantId } = await makeProduct(token, 'Cash Widget', `CASH-${generateId()}`, 1000, 400, 50);

    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 5000 } });
    await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
    });

    const res = await app.inject({ method: 'GET', url: '/dashboard', headers: { authorization: `Bearer ${token}` } });
    expect(res.json().cashInDrawer).toBe(6000); // GH₵50 float + GH₵10 cash sale, before the shift ever closes
  });

  it('attention list surfaces out-of-stock, low-stock, a real till variance, and open review-queue items — each with a working deep link', async () => {
    const { token } = await makeLocationWithOwner('Dashboard Attention Shop');
    await makeProduct(token, 'Out Widget', `ATT-OUT-${generateId()}`, 1000, 400, 0);
    await makeProduct(token, 'Low Widget', `ATT-LOW-${generateId()}`, 1000, 400, 2, 5);

    // A till variance well past the GH₵20 default threshold.
    const shift = (
      await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 0 } })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/till-shifts/${shift.id}/close`,
      headers: { authorization: `Bearer ${token}` },
      payload: { countedCash: 5000, notes: 'deliberately way off' },
    });

    await app.prisma.reviewQueueItem.create({
      data: { id: generateId(), type: 'SYNC_VALIDATION_FAILURE', reason: 'dashboard attention test', details: {} },
    });

    const res = await app.inject({ method: 'GET', url: '/dashboard', headers: { authorization: `Bearer ${token}` } });
    const attention = res.json().attention as Array<{ type: string; linkPath: string; count: number }>;

    expect(attention.find((a) => a.type === 'OUT_OF_STOCK')).toMatchObject({ count: 1, linkPath: '/inventory?stockLevel=OUT' });
    expect(attention.find((a) => a.type === 'LOW_STOCK')).toMatchObject({ count: 1, linkPath: '/inventory?stockLevel=LOW' });
    expect(attention.find((a) => a.type === 'TILL_VARIANCE')).toMatchObject({ count: 1, linkPath: '/sales' });
    expect(attention.find((a) => a.type === 'REVIEW_QUEUE')?.linkPath).toBe('/review-queue');
    expect((attention.find((a) => a.type === 'REVIEW_QUEUE')?.count ?? 0) >= 1).toBe(true);
  });
});
