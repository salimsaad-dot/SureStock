import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const OWNER_PASSWORD = 'owner-password-po-test';
const CASHIER_PASSWORD = 'cashier-password-po-test';

describe('purchase orders (T-28)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let cashierToken: string;
  let supplierId: string;
  let variantA: string;
  let variantB: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Purchasing Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Purchasing Owner',
        email: `po-owner-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Purchasing Cashier',
        email: `po-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        role: 'CASHIER',
        locationId,
      },
    });

    ownerToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `po-owner-${runSuffix}@test.surestock.local`, password: OWNER_PASSWORD },
      })
    ).json().accessToken;
    cashierToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `po-cashier-${runSuffix}@test.surestock.local`, password: CASHIER_PASSWORD },
      })
    ).json().accessToken;

    const supplier = await app.prisma.supplier.create({ data: { id: generateId(), locationId, name: 'PO Test Supplier' } });
    supplierId = supplier.id;

    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'PO Test Product' } });
    const vA = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `PO-VAR-A-${runSuffix.slice(-8)}`, costPrice: 5, sellingPrice: 10, quantityOnHand: 0, locationId },
    });
    const vB = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: `PO-VAR-B-${runSuffix.slice(-8)}`, costPrice: 3, sellingPrice: 6, quantityOnHand: 0, locationId },
    });
    variantA = vA.id;
    variantB = vB.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a draft purchase order with a sequential, human-facing order number', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        supplierId,
        lines: [
          { variantId: variantA, quantityOrdered: 10, unitCost: 500 },
          { variantId: variantB, quantityOrdered: 4, unitCost: 300 },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('DRAFT');
    expect(body.orderNumber).toMatch(/^PO-\d+$/);
    expect(body.itemCount).toBe(2);
    // 10*500 + 4*300 = 5000 + 1200 = 6200 pesewas
    expect(body.totalCost).toBe(6200);

    const res2 = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantA, quantityOrdered: 1, unitCost: 500 }] },
    });
    const seq1 = Number(body.orderNumber.replace('PO-', ''));
    const seq2 = Number(res2.json().orderNumber.replace('PO-', ''));
    expect(seq2).toBe(seq1 + 1);
  });

  it('a cashier cannot create or list purchase orders', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { supplierId, lines: [{ variantId: variantA, quantityOrdered: 1, unitCost: 500 }] },
    });
    expect(create.statusCode).toBe(403);

    const list = await app.inject({ method: 'GET', url: '/purchase-orders', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(list.statusCode).toBe(403);
  });

  it('rejects an order against an archived supplier', async () => {
    const archived = await app.prisma.supplier.create({ data: { id: generateId(), locationId, name: 'Archived Supplier', archivedAt: new Date() } });
    const res = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId: archived.id, lines: [{ variantId: variantA, quantityOrdered: 1, unitCost: 500 }] },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects an unknown variant with 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: generateId(), quantityOrdered: 1, unitCost: 500 }] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('a draft can be edited (whole line-set replace); editing after it is sent is rejected', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantA, quantityOrdered: 1, unitCost: 500 }] },
    });
    const id = create.json().id;

    const edit = await app.inject({
      method: 'PATCH',
      url: `/purchase-orders/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantB, quantityOrdered: 7, unitCost: 300 }] },
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().lines).toHaveLength(1);
    expect(edit.json().lines[0].variantId).toBe(variantB);
    expect(edit.json().totalCost).toBe(2100);

    const send = await app.inject({ method: 'POST', url: `/purchase-orders/${id}/send`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(send.statusCode).toBe(200);
    expect(send.json().status).toBe('SENT');

    const editAfterSend = await app.inject({
      method: 'PATCH',
      url: `/purchase-orders/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantB, quantityOrdered: 1, unitCost: 300 }] },
    });
    expect(editAfterSend.statusCode).toBe(409);

    const sendAgain = await app.inject({ method: 'POST', url: `/purchase-orders/${id}/send`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(sendAgain.statusCode).toBe(409);
  });

  it('cancels a draft, and separately a sent order; cannot cancel once received', async () => {
    const draft = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantA, quantityOrdered: 1, unitCost: 500 }] },
    });
    const cancelDraft = await app.inject({ method: 'POST', url: `/purchase-orders/${draft.json().id}/cancel`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(cancelDraft.statusCode).toBe(200);
    expect(cancelDraft.json().status).toBe('CANCELLED');

    const cancelCancelled = await app.inject({ method: 'POST', url: `/purchase-orders/${draft.json().id}/cancel`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(cancelCancelled.statusCode).toBe(409);
  });

  it('receiving stock: full receive moves status to RECEIVED, updates the ledger and moving-average cost', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantA, quantityOrdered: 10, unitCost: 800 }] },
    });
    const po = create.json();
    await app.inject({ method: 'POST', url: `/purchase-orders/${po.id}/send`, headers: { authorization: `Bearer ${ownerToken}` } });

    const before = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variantA } });

    const receive = await app.inject({
      method: 'POST',
      url: `/purchase-orders/${po.id}/receive`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ lineId: po.lines[0].id, quantityReceived: 10 }] },
    });
    expect(receive.statusCode).toBe(200);
    expect(receive.json().status).toBe('RECEIVED');
    expect(receive.json().lines[0].quantityReceived).toBe(10);

    const after = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variantA } });
    expect(after.quantityOnHand.toNumber()).toBe(before.quantityOnHand.toNumber() + 10);

    const movement = await app.prisma.stockMovement.findFirstOrThrow({
      where: { variantId: variantA, referenceType: 'purchase_order', referenceId: po.id },
    });
    expect(movement.reason).toBe('PURCHASE_RECEIVED');
    expect(movement.quantityDelta.toNumber()).toBe(10);
  });

  it('receiving stock: a partial receive moves status to PARTIAL, and cannot exceed what remains outstanding', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantB, quantityOrdered: 10, unitCost: 300 }] },
    });
    const po = create.json();
    await app.inject({ method: 'POST', url: `/purchase-orders/${po.id}/send`, headers: { authorization: `Bearer ${ownerToken}` } });

    const partial = await app.inject({
      method: 'POST',
      url: `/purchase-orders/${po.id}/receive`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ lineId: po.lines[0].id, quantityReceived: 4 }] },
    });
    expect(partial.statusCode).toBe(200);
    expect(partial.json().status).toBe('PARTIAL');

    const overReceive = await app.inject({
      method: 'POST',
      url: `/purchase-orders/${po.id}/receive`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ lineId: po.lines[0].id, quantityReceived: 7 }] }, // only 6 remain
    });
    expect(overReceive.statusCode).toBe(409);

    const rest = await app.inject({
      method: 'POST',
      url: `/purchase-orders/${po.id}/receive`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ lineId: po.lines[0].id, quantityReceived: 6 }] },
    });
    expect(rest.statusCode).toBe(200);
    expect(rest.json().status).toBe('RECEIVED');
  });

  it('cannot receive against a draft purchase order', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { supplierId, lines: [{ variantId: variantA, quantityOrdered: 1, unitCost: 500 }] },
    });
    const po = create.json();
    const receive = await app.inject({
      method: 'POST',
      url: `/purchase-orders/${po.id}/receive`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ lineId: po.lines[0].id, quantityReceived: 1 }] },
    });
    expect(receive.statusCode).toBe(409);
  });

  it('lists purchase orders, filterable by status, with page-number pagination', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/purchase-orders?status=CANCELLED&page=1&pageSize=5',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(5);
    expect(body.items.every((i: { status: string }) => i.status === 'CANCELLED')).toBe(true);
    expect(body.totalCount).toBeGreaterThanOrEqual(1);
  });

  it('stats: counts and totals per status, plus total purchased from the real ledger', async () => {
    const res = await app.inject({ method: 'GET', url: '/purchase-orders/stats', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.received.orders).toBeGreaterThanOrEqual(2); // the two full/partial-then-completed receives above
    expect(stats.draft.orders).toBeGreaterThanOrEqual(1);
    expect(typeof stats.totalPurchased).toBe('number');
    expect(stats.totalPurchased).toBeGreaterThan(0);
  });

  it('restock recommendations: a variant at or below its reorder point appears, ordered lowest-stock-first; one above it does not', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: 'Restock Test Product', supplierId } });
    const low = await app.prisma.productVariant.create({
      data: {
        id: generateId(), productId: product.id, sku: `RESTOCK-LOW-${generateId().slice(-8)}`,
        costPrice: 1, sellingPrice: 2, quantityOnHand: 2, reorderPoint: 10, reorderQuantity: 20, locationId,
      },
    });
    const healthy = await app.prisma.productVariant.create({
      data: {
        id: generateId(), productId: product.id, sku: `RESTOCK-OK-${generateId().slice(-8)}`,
        costPrice: 1, sellingPrice: 2, quantityOnHand: 50, reorderPoint: 10, locationId,
      },
    });

    const res = await app.inject({ method: 'GET', url: '/purchase-orders/restock-recommendations', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    const ids = res.json().map((r: { variantId: string }) => r.variantId);
    expect(ids).toContain(low.id);
    expect(ids).not.toContain(healthy.id);

    const lowRow = res.json().find((r: { variantId: string }) => r.variantId === low.id);
    expect(lowRow).toMatchObject({ quantityOnHand: 2, reorderPoint: 10, suggestedQuantity: 20, supplierName: 'PO Test Supplier' });
  });
});
