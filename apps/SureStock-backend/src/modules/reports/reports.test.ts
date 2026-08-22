import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

describe('reports (Reports screen)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let cashierToken: string;
  const createdProductIds: string[] = [];

  async function makeLocationWithOwner(label: string) {
    const newLocationId = generateId();
    await app.prisma.location.create({ data: { id: newLocationId, name: label, currency: 'GHS' } });
    const runSuffix = generateId();
    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: `${label} Owner`,
        email: `${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('reports-test-password'),
        role: 'OWNER',
        locationId: newLocationId,
      },
    });
    const token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'reports-test-password' } })
    ).json().accessToken;
    return { locationId: newLocationId, ownerId, token };
  }

  async function makeProduct(token: string, name: string, sku: string, sellingPrice: number, costPrice: number, openingQuantity = 100) {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { name, variants: [{ sku, costPrice, sellingPrice, openingQuantity }] },
    });
    createdProductIds.push(res.json().id);
    return { productId: res.json().id, variantId: res.json().variants[0].id };
  }

  async function sellAs(token: string, variantId: string, quantity: number, unitPrice: number, method: 'CASH' | 'MOBILE_MONEY' = 'CASH') {
    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 0 } });
    return app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ variantId, quantity }], payments: [{ method, amount: quantity * unitPrice }] },
    });
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const runSuffix = generateId();
    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Reports Test Shop', currency: 'GHS' } });

    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Reports Owner',
        email: `reports-owner-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('reports-owner-password'),
        role: 'OWNER',
        locationId,
      },
    });
    ownerToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `reports-owner-${runSuffix}@test.surestock.local`, password: 'reports-owner-password' },
      })
    ).json().accessToken;

    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Reports Cashier',
        email: `reports-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('reports-cashier-password'),
        role: 'CASHIER',
        locationId,
      },
    });
    cashierToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `reports-cashier-${runSuffix}@test.surestock.local`, password: 'reports-cashier-password' },
      })
    ).json().accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function todayRange() {
    return { dateFrom: new Date(Date.now() - 3600_000).toISOString(), dateTo: new Date(Date.now() + 3600_000).toISOString() };
  }

  it('only Manager/Owner can reach any reports endpoint, not Cashier', async () => {
    const { dateFrom, dateTo } = todayRange();
    for (const path of ['/reports/overview', '/reports/trend', '/reports/payment-breakdown', '/reports/products', '/reports/export']) {
      const res = await app.inject({
        method: 'GET',
        url: `${path}?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        headers: { authorization: `Bearer ${cashierToken}` },
      });
      expect(res.statusCode, path).toBe(403);
    }
  });

  it('overview computes net sales, gross profit, transaction count, and refunds correctly, with no fabricated prior-period comparison', async () => {
    const { token } = await makeLocationWithOwner('Overview Test Shop');
    const { variantId } = await makeProduct(token, 'Overview Widget', `OVERVIEW-${generateId()}`, 1000, 400, 10);

    const sale = await sellAs(token, variantId, 2, 1000); // 2 * GH₵10 = GH₵20, cost GH₵8
    expect(sale.statusCode).toBe(201);

    await app.inject({
      method: 'POST',
      url: `/sales/${sale.json().id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ saleLineId: sale.json().lines[0].id, quantity: 1, restock: true }], method: 'CASH', reason: 'test' },
    });

    const { dateFrom, dateTo } = todayRange();
    const res = await app.inject({
      method: 'GET',
      url: `/reports/overview?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.transactionCount).toBe(1); // the refund doesn't count as its own transaction
    expect(body.totalSales).toBe(1000); // 2000 sold - 1000 refunded, net
    expect(body.refundTotal).toBe(1000);
    expect(body.avgOrderValue).toBe(2000); // gross (pre-refund) / transactionCount
    expect(body.grossProfit).toBe(600); // (2000-800) sold + (-1000-(-400)) refunded

    // A brand-new location has nothing in the prior period — every
    // comparison should be an honest "can't say," not a fake 0% or Infinity.
    expect(body.totalSalesChangePct).toBeNull();
    expect(body.grossProfitChangePct).toBeNull();
    expect(body.transactionCountChangePct).toBeNull();
  });

  it('inventory snapshot buckets a product by its worst variant, matching the frontend rule exactly', async () => {
    const { token } = await makeLocationWithOwner('Inventory Snapshot Shop');
    await makeProduct(token, 'In Stock Item', `INV-OK-${generateId()}`, 1000, 400, 20);
    await makeProduct(token, 'Out Of Stock Item', `INV-OUT-${generateId()}`, 1000, 400, 0);
    const low = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Low Stock Item', variants: [{ sku: `INV-LOW-${generateId()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: 3, reorderPoint: 5 }] },
    });
    createdProductIds.push(low.json().id);

    const { dateFrom, dateTo } = todayRange();
    const res = await app.inject({
      method: 'GET',
      url: `/reports/overview?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = res.json();
    expect(body.totalProductCount).toBe(3);
    expect(body.outOfStockCount).toBe(1);
    expect(body.lowStockCount).toBe(1);
    expect(body.inventoryValue).toBe(20 * 400 + 0 * 400 + 3 * 400); // qty * costPrice, summed
  });

  it('total purchased reads from real PURCHASE_RECEIVED ledger movements, independent of any Purchasing feature', async () => {
    const { token } = await makeLocationWithOwner('Purchased Test Shop');
    const { variantId } = await makeProduct(token, 'Received Widget', `RECV-${generateId()}`, 1000, 400, 0);

    const receive = await app.inject({
      method: 'POST',
      url: '/inventory/receive',
      headers: { authorization: `Bearer ${token}` },
      payload: { lines: [{ variantId, quantity: 10, unitCost: 500 }] },
    });
    expect(receive.statusCode).toBe(201);

    const { dateFrom, dateTo } = todayRange();
    const res = await app.inject({
      method: 'GET',
      url: `/reports/overview?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json().totalPurchased).toBe(5000); // 10 units * 500 pesewas
  });

  it('trend buckets sales by day across the requested range', async () => {
    const { token } = await makeLocationWithOwner('Trend Test Shop');
    const { variantId } = await makeProduct(token, 'Trend Widget', `TREND-${generateId()}`, 1000, 400, 10);
    await sellAs(token, variantId, 1, 1000);

    const { dateFrom, dateTo } = todayRange();
    const res = await app.inject({ method: 'GET', url: `/reports/trend?dateFrom=${dateFrom}&dateTo=${dateTo}`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const trend = res.json();
    expect(Array.isArray(trend)).toBe(true);
    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = trend.find((t: { date: string }) => t.date === today);
    expect(todayEntry?.totalSales).toBe(1000);
  });

  it('payment breakdown excludes CHANGE rows and nets refunds through the same method', async () => {
    const { token } = await makeLocationWithOwner('Payment Breakdown Shop');
    const { variantId } = await makeProduct(token, 'Payment Widget', `PAY-${generateId()}`, 1000, 400, 10);

    // Tender GH₵15 cash for a GH₵10 sale — produces a real CHANGE row.
    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 0 } });
    const sale = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 1500 }] },
    });
    expect(sale.statusCode).toBe(201);

    const { dateFrom, dateTo } = todayRange();
    const res = await app.inject({
      method: 'GET',
      url: `/reports/payment-breakdown?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const breakdown = res.json();
    expect(breakdown.find((b: { method: string }) => b.method === 'CHANGE')).toBeUndefined();
    expect(breakdown.find((b: { method: string }) => b.method === 'CASH')?.total).toBe(1000); // net of the change given back
  });

  it('top/low products rank by real units sold, ignoring refund lines entirely', async () => {
    const { token } = await makeLocationWithOwner('Products Rank Shop');
    const high = await makeProduct(token, 'High Seller', `RANK-HIGH-${generateId()}`, 1000, 400, 20);
    const low = await makeProduct(token, 'Low Seller', `RANK-LOW-${generateId()}`, 1000, 400, 20);

    await sellAs(token, high.variantId, 5, 1000);
    const lowSale = await sellAs(token, low.variantId, 1, 1000);

    // Refunding the low seller's one unit shouldn't erase it from the
    // ranking or reduce its qtySold — refund lines are excluded outright.
    await app.inject({
      method: 'POST',
      url: `/sales/${lowSale.json().id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ saleLineId: lowSale.json().lines[0].id, quantity: 1, restock: true }], method: 'CASH', reason: 'test' },
    });

    const { dateFrom, dateTo } = todayRange();
    const top = await app.inject({ method: 'GET', url: `/reports/products?direction=top&dateFrom=${dateFrom}&dateTo=${dateTo}`, headers: { authorization: `Bearer ${token}` } });
    const topIds = top.json().map((p: { variantId: string }) => p.variantId);
    expect(topIds.indexOf(high.variantId)).toBeLessThan(topIds.indexOf(low.variantId));

    const lowRes = await app.inject({ method: 'GET', url: `/reports/products?direction=low&dateFrom=${dateFrom}&dateTo=${dateTo}`, headers: { authorization: `Bearer ${token}` } });
    const lowEntry = lowRes.json().find((p: { variantId: string }) => p.variantId === low.variantId);
    expect(lowEntry?.qtySold).toBe(1); // unaffected by the refund
  });

  it('top/low products can be scoped to one category', async () => {
    const { token } = await makeLocationWithOwner('Products Category Shop');
    const category = await app.prisma.category.create({ data: { id: generateId(), name: `Reports Cat ${generateId()}` } });
    const inCategory = await makeProduct(token, 'In Category Item', `CAT-IN-${generateId()}`, 1000, 400, 20);
    await app.prisma.product.update({ where: { id: inCategory.productId }, data: { categoryId: category.id } });
    const outOfCategory = await makeProduct(token, 'Out Of Category Item', `CAT-OUT-${generateId()}`, 1000, 400, 20);

    await sellAs(token, inCategory.variantId, 1, 1000);
    await sellAs(token, outOfCategory.variantId, 1, 1000);

    const { dateFrom, dateTo } = todayRange();
    const res = await app.inject({
      method: 'GET',
      url: `/reports/products?categoryId=${category.id}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const ids = res.json().map((p: { variantId: string }) => p.variantId);
    expect(ids).toContain(inCategory.variantId);
    expect(ids).not.toContain(outOfCategory.variantId);
  });

  it('export produces one CSV with every section', async () => {
    const { dateFrom, dateTo } = todayRange();
    const res = await app.inject({
      method: 'GET',
      url: `/reports/export?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    for (const section of ['Summary', 'Sales Over Time', 'Sales By Payment Method', 'Top Selling Products', 'Low / Slow Moving Products']) {
      expect(res.body).toContain(section);
    }
  });
});
