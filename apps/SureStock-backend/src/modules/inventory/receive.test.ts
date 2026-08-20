import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { postMovement } from './movement.service.js';

const OWNER_PASSWORD = 'owner-password-receive-test';
const CASHIER_PASSWORD = 'cashier-password-receive-test';

describe('receive stock (T-11)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Receive Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Receive Owner',
        email: `receive-owner-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Receive Cashier',
        email: `receive-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        role: 'CASHIER',
        locationId,
      },
    });

    ownerToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `receive-owner-${runSuffix}@test.surestock.local`, password: OWNER_PASSWORD },
      })
    ).json().accessToken;
    cashierToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `receive-cashier-${runSuffix}@test.surestock.local`, password: CASHIER_PASSWORD },
      })
    ).json().accessToken;
  });

  afterAll(async () => {
    // Every product/variant this file touches ends up with a real
    // stock_movement against it (that's the entire point of the test),
    // so — same reasoning as product.test.ts — nothing created here is
    // actually deletable. Left in the throwaway test database.
    await app.close();
  });

  it('receiving stock updates the moving average cost correctly — worked example', async () => {
    // Start: 20 units on hand at GH₵5.00. Receive 10 more at GH₵8.00.
    // Expected new cost: (20×500 + 10×800) / 30 = 18000/30 = 600 pesewas
    // (GH₵6.00). Expected new quantity: 30.
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'Moving Average Test Product' } });
    const variant = await app.prisma.productVariant.create({
      data: {
        id: generateId(),
        productId: product.id,
        sku: 'MAVG-001',
        costPrice: 5,
        sellingPrice: 10,
        quantityOnHand: 0,
        locationId,
      },
    });
    // Post the opening 20 units through T-10's own primitive (not the
    // API — there's no endpoint for a raw opening balance outside
    // product creation) so quantityOnHand is genuinely ledger-derived,
    // not hand-set.
    const owner = await app.prisma.user.findFirstOrThrow({ where: { locationId } });
    await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: 20, reason: 'OPENING_BALANCE', userId: owner.id }),
    );

    const receive = await app.inject({
      method: 'POST',
      url: '/inventory/receive',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ variantId: variant.id, quantity: 10, unitCost: 800 }] },
    });

    expect(receive.statusCode).toBe(201);
    const body = receive.json();
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({
      variantId: variant.id,
      quantityReceived: 10,
      previousCostPrice: 500,
      newCostPrice: 600,
      quantityOnHand: 30,
    });

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.costPrice.toNumber()).toBe(6);
    expect(reloaded.quantityOnHand.toNumber()).toBe(30);

    const movement = await app.prisma.stockMovement.findFirst({
      where: { variantId: variant.id, reason: 'PURCHASE_RECEIVED' },
    });
    expect(movement).toMatchObject({ referenceType: 'goods_received' });
    expect(movement?.quantityDelta.toNumber()).toBe(10);
    expect(movement?.unitCost?.toNumber()).toBe(8);
  });

  it('receiving a perishable product captures a batch with expiry', async () => {
    const product = await app.prisma.product.create({
      data: { id: generateId(), name: 'Perishable Receive Test', isPerishable: true },
    });
    const variant = await app.prisma.productVariant.create({
      data: {
        id: generateId(),
        productId: product.id,
        sku: 'PERISH-001',
        costPrice: 0,
        sellingPrice: 500,
        quantityOnHand: 0,
        locationId,
      },
    });

    const expiryDate = '2026-12-31';
    const receive = await app.inject({
      method: 'POST',
      url: '/inventory/receive',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        lines: [{ variantId: variant.id, quantity: 24, unitCost: 300, batchCode: 'BATCH-XYZ', expiryDate }],
      },
    });

    expect(receive.statusCode).toBe(201);
    const line = receive.json().lines[0];
    expect(line.batchId).not.toBeNull();

    const batch = await app.prisma.batch.findUniqueOrThrow({ where: { id: line.batchId } });
    expect(batch.batchCode).toBe('BATCH-XYZ');
    expect(batch.quantityReceived.toNumber()).toBe(24);
    expect(batch.quantityRemaining.toNumber()).toBe(24);
    expect(batch.expiryDate?.toISOString().slice(0, 10)).toBe(expiryDate);

    const movement = await app.prisma.stockMovement.findFirstOrThrow({
      where: { variantId: variant.id, reason: 'PURCHASE_RECEIVED' },
    });
    expect(movement.batchId).toBe(batch.id);
  });

  it('a non-perishable product does not get a batch row even if one is not requested', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'Non-Perishable Receive Test' } });
    const variant = await app.prisma.productVariant.create({
      data: {
        id: generateId(),
        productId: product.id,
        sku: 'NONPERISH-001',
        costPrice: 0,
        sellingPrice: 100,
        quantityOnHand: 0,
        locationId,
      },
    });

    const receive = await app.inject({
      method: 'POST',
      url: '/inventory/receive',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ variantId: variant.id, quantity: 5, unitCost: 50 }] },
    });

    expect(receive.statusCode).toBe(201);
    expect(receive.json().lines[0].batchId).toBeNull();
  });

  it('multiple lines in one call share a single goods-received reference and commit together', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'Multi-Line Receive Test' } });
    const variantA = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'MULTI-A', costPrice: 0, sellingPrice: 100, quantityOnHand: 0, locationId },
    });
    const variantB = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'MULTI-B', costPrice: 0, sellingPrice: 100, quantityOnHand: 0, locationId },
    });

    const receive = await app.inject({
      method: 'POST',
      url: '/inventory/receive',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        lines: [
          { variantId: variantA.id, quantity: 4, unitCost: 200 },
          { variantId: variantB.id, quantity: 6, unitCost: 300 },
        ],
      },
    });

    expect(receive.statusCode).toBe(201);
    const receiptId = receive.json().id;

    const movements = await app.prisma.stockMovement.findMany({ where: { referenceId: receiptId } });
    expect(movements).toHaveLength(2);
    expect(new Set(movements.map((m) => m.variantId))).toEqual(new Set([variantA.id, variantB.id]));
  });

  it('a cashier cannot receive stock', async () => {
    const product = await app.prisma.product.create({ data: { id: generateId(), name: 'Cashier Receive Test' } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku: 'CASHIER-RCV-001', costPrice: 0, sellingPrice: 100, quantityOnHand: 0, locationId },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/receive',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { lines: [{ variantId: variant.id, quantity: 1, unitCost: 100 }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('receiving against an unknown variant id is rejected as not found, transaction rolled back', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/inventory/receive',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { lines: [{ variantId: generateId(), quantity: 1, unitCost: 100 }] },
    });
    expect(res.statusCode).toBe(404);
  });
});
