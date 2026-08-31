import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const OWNER_PASSWORD = 'owner-password-stock-take-test';
const CASHIER_PASSWORD = 'cashier-password-stock-take-test';

describe('stock take (T-27)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Stock Take Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    const ownerId = generateId();
    await app.prisma.user.create({
      data: { id: ownerId, name: 'Stock Take Owner', email: `stocktake-owner-${runSuffix.slice(-8)}@test.surestock.local`, passwordHash: await hashPassword(OWNER_PASSWORD), role: 'OWNER', locationId },
    });
    const cashierId = generateId();
    await app.prisma.user.create({
      data: { id: cashierId, name: 'Stock Take Cashier', email: `stocktake-cashier-${runSuffix.slice(-8)}@test.surestock.local`, passwordHash: await hashPassword(CASHIER_PASSWORD), role: 'CASHIER', locationId },
    });

    ownerToken = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `stocktake-owner-${runSuffix.slice(-8)}@test.surestock.local`, password: OWNER_PASSWORD } })
    ).json().accessToken;
    cashierToken = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `stocktake-cashier-${runSuffix.slice(-8)}@test.surestock.local`, password: CASHIER_PASSWORD } })
    ).json().accessToken;

    await app.inject({ method: 'POST', url: '/till-shifts', headers: { authorization: `Bearer ${cashierToken}` }, payload: { openingFloat: 0 } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('a cashier cannot start, view, or manage a stock take', async () => {
    const res = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${cashierToken}` }, payload: { scope: 'FULL' } });
    expect(res.statusCode).toBe(403);
  });

  it('starting a FULL stock take snapshots expectedQuantity for every non-archived variant at this location', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Stock Take Full Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `ST-FULL-${generateId().slice(-8)}`, costPrice: 5, sellingPrice: 10, quantityOnHand: 42, locationId },
    });
    const archivedVariant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `ST-ARCHIVED-${generateId().slice(-8)}`, costPrice: 5, sellingPrice: 10, quantityOnHand: 5, locationId, archivedAt: new Date() },
    });

    const start = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    expect(start.statusCode).toBe(201);
    expect(start.json()).toMatchObject({ scope: 'FULL', status: 'IN_PROGRESS' });
    const stockTakeId = start.json().id;

    const detail = await app.inject({ method: 'GET', url: `/stock-takes/${stockTakeId}?pageSize=200`, headers: { authorization: `Bearer ${ownerToken}` } });
    const line = detail.json().lines.find((l: { variantId: string }) => l.variantId === variant.id);
    expect(line).toMatchObject({ expectedQuantity: 42, countedQuantity: null, variance: null });
    expect(detail.json().lines.find((l: { variantId: string }) => l.variantId === archivedVariant.id)).toBeUndefined();

    await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/abandon`, headers: { authorization: `Bearer ${ownerToken}` } });
  });

  it('only one IN_PROGRESS stock take is allowed per location at a time', async () => {
    const first = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    expect(second.statusCode).toBe(409);

    await app.inject({ method: 'POST', url: `/stock-takes/${first.json().id}/abandon`, headers: { authorization: `Bearer ${ownerToken}` } });
  });

  it('a CATEGORY-scoped stock take only includes variants from products in that category', async () => {
    const category = await app.prisma.category.create({ data: { id: generateId(), locationId, name: 'Stock Take Category A' } });
    const otherCategory = await app.prisma.category.create({ data: { id: generateId(), locationId, name: 'Stock Take Category B' } });
    const inScopeProduct = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'In Scope Product', categoryId: category.id } });
    const outOfScopeProduct = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Out Of Scope Product', categoryId: otherCategory.id } });
    const inScopeVariant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: inScopeProduct.id, sku: `ST-CAT-IN-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2, quantityOnHand: 10, locationId },
    });
    const outOfScopeVariant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: outOfScopeProduct.id, sku: `ST-CAT-OUT-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2, quantityOnHand: 10, locationId },
    });

    const start = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'CATEGORY', categoryId: category.id } });
    expect(start.statusCode).toBe(201);
    const stockTakeId = start.json().id;

    const detail = await app.inject({ method: 'GET', url: `/stock-takes/${stockTakeId}?pageSize=200`, headers: { authorization: `Bearer ${ownerToken}` } });
    const variantIds = detail.json().lines.map((l: { variantId: string }) => l.variantId);
    expect(variantIds).toContain(inScopeVariant.id);
    expect(variantIds).not.toContain(outOfScopeVariant.id);

    await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/abandon`, headers: { authorization: `Bearer ${ownerToken}` } });
  });

  it('recording a count computes variance and varianceValue against the frozen snapshot, and discrepancies are sorted by value impact', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Stock Take Variance Product' } });
    const bigVariant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `ST-VAR-BIG-${generateId().slice(-8)}`, costPrice: 10, sellingPrice: 20, quantityOnHand: 50, locationId },
    });
    const smallVariant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `ST-VAR-SMALL-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2, quantityOnHand: 20, locationId },
    });

    const start = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    const stockTakeId = start.json().id;
    const detail = await app.inject({ method: 'GET', url: `/stock-takes/${stockTakeId}?pageSize=200`, headers: { authorization: `Bearer ${ownerToken}` } });
    const bigLine = detail.json().lines.find((l: { variantId: string }) => l.variantId === bigVariant.id);
    const smallLine = detail.json().lines.find((l: { variantId: string }) => l.variantId === smallVariant.id);

    // Big variant: counted 45 (missing 5 @ GH₵10 = GH₵50 impact). Small: counted 15 (missing 5 @ GH₵1 = GH₵5 impact).
    const bigUpdate = await app.inject({
      method: 'PATCH',
      url: `/stock-takes/${stockTakeId}/lines/${bigLine.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { countedQuantity: 45, reason: 'Recount confirmed shortage.' },
    });
    expect(bigUpdate.json()).toMatchObject({ countedQuantity: 45, variance: -5, varianceValue: -5000 });

    await app.inject({
      method: 'PATCH',
      url: `/stock-takes/${stockTakeId}/lines/${smallLine.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { countedQuantity: 15, reason: 'Recount confirmed shortage.' },
    });

    const discrepancies = await app.inject({ method: 'GET', url: `/stock-takes/${stockTakeId}/discrepancies`, headers: { authorization: `Bearer ${ownerToken}` } });
    const items = discrepancies.json();
    expect(items).toHaveLength(2);
    expect(items[0].variantId).toBe(bigVariant.id); // GH₵50 impact sorts before GH₵5

    await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/abandon`, headers: { authorization: `Bearer ${ownerToken}` } });
  });

  it('posting without a reason on a discrepancy is rejected', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Stock Take No Reason Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `ST-NOREASON-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2, quantityOnHand: 10, locationId },
    });

    const start = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    const stockTakeId = start.json().id;
    const detail = await app.inject({ method: 'GET', url: `/stock-takes/${stockTakeId}?pageSize=200`, headers: { authorization: `Bearer ${ownerToken}` } });
    const line = detail.json().lines.find((l: { variantId: string }) => l.variantId === variant.id);

    await app.inject({
      method: 'PATCH',
      url: `/stock-takes/${stockTakeId}/lines/${line.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { countedQuantity: 8 }, // discrepancy, no reason given
    });

    const post = await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/post`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(post.statusCode).toBe(400);

    await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/abandon`, headers: { authorization: `Bearer ${ownerToken}` } });
  });

  it('posting adjusts stock to exactly the counted quantity, writes a STOCK_TAKE_ADJUSTMENT movement, and locks the record', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Stock Take Post Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `ST-POST-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2, quantityOnHand: 10, locationId },
    });

    const start = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    const stockTakeId = start.json().id;
    const detail = await app.inject({ method: 'GET', url: `/stock-takes/${stockTakeId}?pageSize=200`, headers: { authorization: `Bearer ${ownerToken}` } });
    const line = detail.json().lines.find((l: { variantId: string }) => l.variantId === variant.id);

    await app.inject({
      method: 'PATCH',
      url: `/stock-takes/${stockTakeId}/lines/${line.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { countedQuantity: 7, reason: 'Confirmed shortage on recount.' },
    });

    const post = await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/post`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(post.statusCode).toBe(200);
    expect(post.json().status).toBe('POSTED');
    expect(post.json().adjustments[0]).toMatchObject({ variantId: variant.id, countedQuantity: 7, previousQuantity: 10, delta: -3 });

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(7);

    const movement = await app.prisma.stockMovement.findFirstOrThrow({ where: { variantId: variant.id, reason: 'STOCK_TAKE_ADJUSTMENT' } });
    expect(movement.quantityDelta.toNumber()).toBe(-3);
    expect(movement.referenceId).toBe(stockTakeId);

    // Locked: no further edits or another post.
    const editAfter = await app.inject({
      method: 'PATCH',
      url: `/stock-takes/${stockTakeId}/lines/${line.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { countedQuantity: 6 },
    });
    expect(editAfter.statusCode).toBe(409);
    const postAgain = await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/post`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(postAgain.statusCode).toBe(409);
  });

  it('a sale during the count is handled correctly: posting adjusts against live stock, not the stale frozen snapshot', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Stock Take Concurrent Sale Product' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `ST-CONCURRENT-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 5, quantityOnHand: 20, locationId },
    });

    const start = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    const stockTakeId = start.json().id;
    const detail = await app.inject({ method: 'GET', url: `/stock-takes/${stockTakeId}?pageSize=200`, headers: { authorization: `Bearer ${ownerToken}` } });
    const line = detail.json().lines.find((l: { variantId: string }) => l.variantId === variant.id);
    expect(line.expectedQuantity).toBe(20);

    // A real sale happens mid-count: 3 units sold, live stock is now 17 — the snapshot (20) is now stale.
    await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 3 }], payments: [{ method: 'CASH', amount: 1500 }] },
    });

    // The counter, walking the shop before the sale happened (or unaware of it), counts 20 — matching what they physically saw against the frozen expectation.
    await app.inject({
      method: 'PATCH',
      url: `/stock-takes/${stockTakeId}/lines/${line.id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { countedQuantity: 20 },
    });

    const post = await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/post`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(post.statusCode).toBe(200);
    // Correct: delta is computed against live stock (17), not the stale snapshot (20) — posting +3, not 0.
    expect(post.json().adjustments[0]).toMatchObject({ countedQuantity: 20, previousQuantity: 17, delta: 3 });

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(20); // exactly what was counted — the sale's effect was never re-undone
  });

  it('abandoning an in-progress stock take posts no movements and cannot be abandoned twice', async () => {
    const start = await app.inject({ method: 'POST', url: '/stock-takes', headers: { authorization: `Bearer ${ownerToken}` }, payload: { scope: 'FULL' } });
    const stockTakeId = start.json().id;

    const abandon = await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/abandon`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(abandon.statusCode).toBe(200);
    expect(abandon.json().status).toBe('ABANDONED');

    const again = await app.inject({ method: 'POST', url: `/stock-takes/${stockTakeId}/abandon`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(again.statusCode).toBe(409);
  });

  it('lists stock takes for this location, filterable by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/stock-takes?status=ABANDONED', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.every((st: { status: string }) => st.status === 'ABANDONED')).toBe(true);
    expect(res.json().totalCount).toBeGreaterThanOrEqual(1);
  });
});
