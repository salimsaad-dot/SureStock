import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { postMovement } from './movement.service.js';

const OWNER_PASSWORD = 'owner-password-detail-test';
const CASHIER_PASSWORD = 'cashier-password-detail-test';

describe('product detail: movement history, margin, days-of-cover (T-13)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;
  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Detail Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Detail Owner',
        email: `detail-owner-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Detail Cashier',
        email: `detail-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        role: 'CASHIER',
        locationId,
      },
    });

    ownerToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `detail-owner-${runSuffix}@test.surestock.local`, password: OWNER_PASSWORD },
      })
    ).json().accessToken;
    cashierToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `detail-cashier-${runSuffix}@test.surestock.local`, password: CASHIER_PASSWORD },
      })
    ).json().accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('margin is computed correctly and hidden from cashiers, same as cost price', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'Margin Test Product' } });
    // cost 600 (GH₵6.00), selling 1000 (GH₵10.00) -> margin = (1000-600)/1000 = 40%
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'MARGIN-001', costPrice: 6, sellingPrice: 10, quantityOnHand: 0, locationId },
    });

    const asOwner = await app.inject({
      method: 'GET',
      url: `/products/${product.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const ownerVariant = asOwner.json().variants.find((v: { id: string }) => v.id === variant.id);
    expect(ownerVariant.marginPercent).toBe(40);

    const asCashier = await app.inject({
      method: 'GET',
      url: `/products/${product.id}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    const cashierVariant = asCashier.json().variants.find((v: { id: string }) => v.id === variant.id);
    expect(cashierVariant.marginPercent).toBeUndefined();
    expect(cashierVariant.costPrice).toBeUndefined();
  });

  it('days-of-cover is null with no sales history, and a real estimate once SALE movements exist', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'Days Of Cover Test Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'DOC-001', costPrice: 1, sellingPrice: 2, quantityOnHand: 0, locationId },
    });

    await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: 300, reason: 'OPENING_BALANCE', userId: ownerId }),
    );

    const beforeSales = await app.inject({
      method: 'GET',
      url: `/products/${product.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(beforeSales.json().variants[0].daysOfCover).toBeNull();

    // 30 units sold total over the trailing window -> 1/day average.
    // quantityOnHand after: 300 - 30 = 270 -> 270 days of cover.
    await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: -30, reason: 'SALE', userId: ownerId, referenceType: 'sale' }),
    );

    const afterSales = await app.inject({
      method: 'GET',
      url: `/products/${product.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(afterSales.json().variants[0].daysOfCover).toBe(270);
  });

  it('movement history is paginated, newest first, and filterable by reason', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'History Test Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'HIST-001', costPrice: 1, sellingPrice: 2, quantityOnHand: 0, locationId },
    });

    // 5 movements: OPENING_BALANCE, then alternating SALE/PURCHASE_RECEIVED.
    await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: 100, reason: 'OPENING_BALANCE', userId: ownerId }),
    );
    for (let i = 0; i < 4; i++) {
      const reason = i % 2 === 0 ? 'SALE' : 'PURCHASE_RECEIVED';
      const delta = i % 2 === 0 ? -1 : 5;
      await app.prisma.$transaction((tx) => postMovement(tx, { variantId: variant.id, quantityDelta: delta, reason, userId: ownerId }));
    }

    const page1 = await app.inject({
      method: 'GET',
      url: `/products/${product.id}/variants/${variant.id}/movements?limit=2`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).not.toBeNull();
    // Newest first: the 5th movement posted was PURCHASE_RECEIVED (i=3).
    expect(body1.items[0].reason).toBe('PURCHASE_RECEIVED');

    const page2 = await app.inject({
      method: 'GET',
      url: `/products/${product.id}/variants/${variant.id}/movements?limit=2&cursor=${encodeURIComponent(body1.nextCursor)}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const body2 = page2.json();
    expect(body2.items).toHaveLength(2);
    // No overlap between pages.
    const ids1 = new Set(body1.items.map((m: { id: string }) => m.id));
    for (const m of body2.items) expect(ids1.has(m.id)).toBe(false);

    const saleOnly = await app.inject({
      method: 'GET',
      url: `/products/${product.id}/variants/${variant.id}/movements?reason=SALE`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const saleBody = saleOnly.json();
    expect(saleBody.items.length).toBeGreaterThan(0);
    expect(saleBody.items.every((m: { reason: string }) => m.reason === 'SALE')).toBe(true);
  });

  it('unitCost is hidden from cashiers in movement history, same as everywhere else', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'History Cost Visibility Test' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'HIST-COST-001', costPrice: 1, sellingPrice: 2, quantityOnHand: 0, locationId },
    });
    await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: 10, reason: 'PURCHASE_RECEIVED', userId: ownerId, unitCost: 500 }),
    );

    const asOwner = await app.inject({
      method: 'GET',
      url: `/products/${product.id}/variants/${variant.id}/movements`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(asOwner.json().items[0].unitCost).toBe(500);

    const asCashier = await app.inject({
      method: 'GET',
      url: `/products/${product.id}/variants/${variant.id}/movements`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(asCashier.json().items[0].unitCost).toBeUndefined();
  });

  it('stock on hand matches the ledger exactly, from the product-detail read path itself', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'Ledger Match Test Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'LEDGER-MATCH-001', costPrice: 1, sellingPrice: 2, quantityOnHand: 0, locationId },
    });

    const deltas = [50, -12, 7, -3, -1];
    for (const delta of deltas) {
      const reason = delta > 0 ? 'PURCHASE_RECEIVED' : 'SALE';
      await app.prisma.$transaction((tx) => postMovement(tx, { variantId: variant.id, quantityDelta: delta, reason, userId: ownerId }));
    }

    const detail = await app.inject({
      method: 'GET',
      url: `/products/${product.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    const reportedQuantity = detail.json().variants[0].quantityOnHand;

    const sum = await app.prisma.stockMovement.aggregate({ where: { variantId: variant.id }, _sum: { quantityDelta: true } });
    expect(reportedQuantity).toBe(sum._sum.quantityDelta?.toNumber());
    expect(reportedQuantity).toBe(deltas.reduce((a, b) => a + b, 0));
  });
});
