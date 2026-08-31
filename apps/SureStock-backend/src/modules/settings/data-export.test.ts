import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

describe('data export (T-31)', () => {
  let app: FastifyInstance;

  async function makeLocationWithOwner(label: string) {
    const locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: label, currency: 'GHS' } });
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id: generateId(),
        name: `${label} Owner`,
        email: `${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('export-test-password'),
        role: 'OWNER',
        locationId,
      },
    });
    const token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'export-test-password' } })
    ).json().accessToken;
    return { locationId, token };
  }

  async function makeCashier(locationId: string) {
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: { id: generateId(), name: 'Export Cashier', email: `${runSuffix}@test.surestock.local`, passwordHash: await hashPassword('export-cashier-password'), role: 'CASHIER', locationId },
    });
    return (await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'export-cashier-password' } })).json()
      .accessToken;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('only the Owner can export, not Manager or Cashier', async () => {
    const { locationId, token } = await makeLocationWithOwner('Export Gate Shop');
    const cashierToken = await makeCashier(locationId);

    const asOwner = await app.inject({ method: 'GET', url: '/settings/export', headers: { authorization: `Bearer ${token}` } });
    expect(asOwner.statusCode).toBe(200);
    expect(asOwner.headers['content-type']).toContain('text/csv');

    const asCashier = await app.inject({ method: 'GET', url: '/settings/export', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(asCashier.statusCode).toBe(403);
  });

  it('exports real scoped data and never a password or PIN hash', async () => {
    const { token } = await makeLocationWithOwner('Export Data Shop');
    const uniqueProductName = `Export Widget ${generateId()}`;
    const sku = `EXPORT-${generateId()}`;

    const product = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: uniqueProductName, variants: [{ sku, costPrice: 400, sellingPrice: 1000, openingQuantity: 5 }] },
    });
    const variantId = product.json().variants[0].id;

    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${token}` }, payload: { openingFloat: 0 } });
    const sale = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
    });
    expect(sale.statusCode).toBe(201);

    const res = await app.inject({ method: 'GET', url: '/settings/export', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const csv = res.body;

    expect(csv).toContain(uniqueProductName);
    expect(csv).toContain(sku);
    expect(csv).toContain(sale.json().receiptNumber);
    expect(csv.toLowerCase()).not.toContain('passwordhash');
    expect(csv.toLowerCase()).not.toContain('pinhash');
  });

  it("doesn't leak another location's products or sales into this one's export", async () => {
    const other = await makeLocationWithOwner('Export Other Shop');
    const otherProductName = `Other Shop Only Widget ${generateId()}`;
    await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${other.token}` },
      payload: { name: otherProductName, variants: [{ sku: `OTHER-${generateId()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: 5 }] },
    });

    const { token } = await makeLocationWithOwner('Export Isolated Shop');
    const res = await app.inject({ method: 'GET', url: '/settings/export', headers: { authorization: `Bearer ${token}` } });
    expect(res.body).not.toContain(otherProductName);
  });
});
