import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const OWNER_PASSWORD = 'owner-password-sync-test';
const CASHIER_PASSWORD = 'cashier-password-sync-test';

describe('offline sync (T-21/T-22)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let cashierToken: string;
  let cashierId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Sync Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    const ownerId = generateId();
    await app.prisma.user.create({
      data: { id: ownerId, name: 'Sync Owner', email: `sync-owner-${runSuffix.slice(-8)}@test.surestock.local`, passwordHash: await hashPassword(OWNER_PASSWORD), role: 'OWNER', locationId },
    });
    cashierId = generateId();
    await app.prisma.user.create({
      data: { id: cashierId, name: 'Sync Cashier', email: `sync-cashier-${runSuffix.slice(-8)}@test.surestock.local`, passwordHash: await hashPassword(CASHIER_PASSWORD), role: 'CASHIER', locationId },
    });

    ownerToken = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `sync-owner-${runSuffix.slice(-8)}@test.surestock.local`, password: OWNER_PASSWORD } })
    ).json().accessToken;
    cashierToken = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `sync-cashier-${runSuffix.slice(-8)}@test.surestock.local`, password: CASHIER_PASSWORD } })
    ).json().accessToken;

    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${cashierToken}` }, payload: { openingFloat: 0 } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /sync/catalogue with no since returns the full catalogue, with quantityOnHand and reorderPoint excluded, cost hidden from cashiers', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Delta Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-DELTA-${generateId().slice(-8)}`, costPrice: 3, sellingPrice: 6, quantityOnHand: 40, reorderPoint: 5, locationId },
    });

    const ownerRes = await app.inject({ method: 'GET', url: '/sync/catalogue', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(ownerRes.statusCode).toBe(200);
    const ownerBody = ownerRes.json();
    expect(typeof ownerBody.serverTime).toBe('string');
    const ownerVariant = ownerBody.products.find((p: { id: string }) => p.id === product.id)?.variants.find((v: { id: string }) => v.id === variant.id);
    expect(ownerVariant).toMatchObject({ sku: variant.sku, sellingPrice: 600, costPrice: 300 });
    expect(ownerVariant).not.toHaveProperty('quantityOnHand');
    expect(ownerVariant).not.toHaveProperty('reorderPoint');

    const cashierRes = await app.inject({ method: 'GET', url: '/sync/catalogue', headers: { authorization: `Bearer ${cashierToken}` } });
    const cashierVariant = cashierRes.json().products.find((p: { id: string }) => p.id === product.id)?.variants.find((v: { id: string }) => v.id === variant.id);
    expect(cashierVariant).not.toHaveProperty('costPrice');
  });

  it('a since in the future returns nothing new; a variant-only price edit is caught even though the parent product row was never touched', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Since Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-SINCE-${generateId().slice(-8)}`, costPrice: 3, sellingPrice: 6, quantityOnHand: 10, locationId },
    });

    const future = new Date(Date.now() + 60_000).toISOString();
    const nothingNew = await app.inject({ method: 'GET', url: `/sync/catalogue?since=${encodeURIComponent(future)}`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(nothingNew.json().products.find((p: { id: string }) => p.id === product.id)).toBeUndefined();

    const checkpoint = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await app.prisma.productVariant.update({ where: { id: variant.id }, data: { sellingPrice: 7 } });

    const delta = await app.inject({ method: 'GET', url: `/sync/catalogue?since=${encodeURIComponent(checkpoint)}`, headers: { authorization: `Bearer ${ownerToken}` } });
    const deltaProduct = delta.json().products.find((p: { id: string }) => p.id === product.id);
    expect(deltaProduct).toBeDefined();
    expect(deltaProduct.variants.find((v: { id: string }) => v.id === variant.id).sellingPrice).toBe(700);
  });

  it('POST /sync/batch: a normal sale syncs successfully and decrements stock as usual', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Batch Normal Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-BATCH-OK-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 1, quantityOnHand: 10, locationId },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/sync/batch',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { sales: [{ id: generateId(), lines: [{ variantId: variant.id, quantity: 2 }], payments: [{ method: 'CASH', amount: 200 }] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].status).toBe('ok');

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(8);
  });

  it('POST /sync/batch: a sale that pushes stock negative still commits, and lands a NEGATIVE_STOCK review-queue item', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Batch Negative Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-BATCH-NEG-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 1, quantityOnHand: 2, locationId },
    });
    const saleId = generateId();

    const res = await app.inject({
      method: 'POST',
      url: '/sync/batch',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { sales: [{ id: saleId, lines: [{ variantId: variant.id, quantity: 5 }], payments: [{ method: 'CASH', amount: 500 }] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].status).toBe('ok');

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(-3);

    const reviewItem = await app.prisma.reviewQueueItem.findFirstOrThrow({ where: { saleId, type: 'NEGATIVE_STOCK' } });
    expect(reviewItem.variantId).toBe(variant.id);
    expect(reviewItem.resolvedAt).toBeNull();
  });

  it('POST /sync/batch: a sale requiring a manager override that was never provided is NOT created, and lands a SYNC_VALIDATION_FAILURE item instead', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Batch Override Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-BATCH-OVR-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 1, quantityOnHand: 10, locationId },
    });
    const saleId = generateId();
    const before = new Date();

    const res = await app.inject({
      method: 'POST',
      url: '/sync/batch',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { sales: [{ id: saleId, lines: [{ variantId: variant.id, quantity: 1, discountAmount: 50 }], payments: [{ method: 'CASH', amount: 50 }] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].status).toBe('review');

    const sale = await app.prisma.sale.findUnique({ where: { id: saleId } });
    expect(sale).toBeNull();

    const reviewItem = await app.prisma.reviewQueueItem.findFirstOrThrow({
      where: { type: 'SYNC_VALIDATION_FAILURE', createdAt: { gte: before } },
    });
    expect(reviewItem.saleId).toBeNull();
    expect((reviewItem.details as { attemptedSale: { id: string } }).attemptedSale.id).toBe(saleId);
  });

  it('POST /sync/batch: independent failures in one batch never abort each other', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Batch Mixed Product' } });
    const goodVariant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-BATCH-MIX-OK-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 1, quantityOnHand: 10, locationId },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/sync/batch',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: {
        sales: [
          { id: generateId(), lines: [{ variantId: generateId(), quantity: 1 }], payments: [{ method: 'CASH', amount: 100 }] }, // unknown variant
          { id: generateId(), lines: [{ variantId: goodVariant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 100 }] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const [first, second] = res.json().results;
    expect(first.status).toBe('review');
    expect(second.status).toBe('ok');
  });

  it('POST /sync/batch: syncing the same sale id twice is idempotent, matching the online endpoint', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Batch Idempotent Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-BATCH-DUP-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 1, quantityOnHand: 10, locationId },
    });
    const saleId = generateId();
    const payload = { sales: [{ id: saleId, lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 100 }] }] };

    const first = await app.inject({ method: 'POST', url: '/sync/batch', headers: { authorization: `Bearer ${cashierToken}` }, payload });
    const second = await app.inject({ method: 'POST', url: '/sync/batch', headers: { authorization: `Bearer ${cashierToken}` }, payload });
    expect(first.json().results[0].status).toBe('ok');
    expect(second.json().results[0].status).toBe('ok');

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(9); // decremented once, not twice
  });

  it('a sale synced with its own device-clock soldAt reports at that time, and syncedAt records the real replay time', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Sync Batch SoldAt Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `SYNC-BATCH-TIME-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 1, quantityOnHand: 10, locationId },
    });
    const saleId = generateId();
    const deviceSoldAt = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago

    await app.inject({
      method: 'POST',
      url: '/sync/batch',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { sales: [{ id: saleId, lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 100 }], soldAt: deviceSoldAt.toISOString() }] },
    });

    const sale = await app.prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
    expect(sale.soldAt.getTime()).toBe(deviceSoldAt.getTime());
    expect(sale.syncedAt).not.toBeNull();
    expect(sale.syncedAt!.getTime()).toBeGreaterThan(deviceSoldAt.getTime());
  });
});
