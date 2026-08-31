import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { postMovement } from './movement.service.js';

const OWNER_PASSWORD = 'owner-password-adjustment-test';
const CASHIER_PASSWORD = 'cashier-password-adjustment-test';

describe('manual stock adjustments (T-12)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;
  let ownerToken: string;
  let cashierToken: string;

  async function createVariantWithStock(sku: string, quantity: number) {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: `Adjustment Test ${sku}` } });
    const variant = await app.prisma.productVariant.create({
      data: { id: generateId(), productId: product.id, sku, costPrice: 100, sellingPrice: 200, quantityOnHand: 0, locationId },
    });
    if (quantity !== 0) {
      await app.prisma.$transaction((tx) =>
        postMovement(tx, { variantId: variant.id, quantityDelta: quantity, reason: 'OPENING_BALANCE', userId: ownerId }),
      );
    }
    return variant;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Adjustment Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Adjustment Owner',
        email: `adjustment-owner-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Adjustment Cashier',
        email: `adjustment-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        role: 'CASHIER',
        locationId,
      },
    });

    ownerToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `adjustment-owner-${runSuffix}@test.surestock.local`, password: OWNER_PASSWORD },
      })
    ).json().accessToken;
    cashierToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `adjustment-cashier-${runSuffix}@test.surestock.local`, password: CASHIER_PASSWORD },
      })
    ).json().accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a damage adjustment writes a movement and an audit log entry with correct before/after values', async () => {
    const variant = await createVariantWithStock('ADJ-DAMAGE-001', 20);

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { variantId: variant.id, quantityDelta: -3, reasonCode: 'DAMAGE', note: 'Three units crushed in delivery' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ previousQuantity: 20, quantityOnHand: 17, quantityDelta: -3, reasonCode: 'DAMAGE' });

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(17);

    const movement = await app.prisma.stockMovement.findFirstOrThrow({ where: { variantId: variant.id, reason: 'DAMAGE' } });
    expect(movement.note).toBe('Three units crushed in delivery');
    expect(movement.referenceType).toBe('adjustment');

    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'product_variant', entityId: variant.id, action: 'STOCK_ADJUSTMENT' },
    });
    expect(audit.before).toMatchObject({ quantityOnHand: 20 });
    expect(audit.after).toMatchObject({ quantityOnHand: 17, quantityDelta: -3, reasonCode: 'DAMAGE' });
    expect(movement.referenceId).toBe(audit.id);
  });

  it('a stock-take adjustment can be positive (found more than expected)', async () => {
    const variant = await createVariantWithStock('ADJ-STOCKTAKE-001', 10);

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { variantId: variant.id, quantityDelta: 2, reasonCode: 'STOCK_TAKE_ADJUSTMENT', note: 'Recount found 2 extra units' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().quantityOnHand).toBe(12);
  });

  it('rejects a positive delta for DAMAGE, EXPIRY, or THEFT — always a loss', async () => {
    const variant = await createVariantWithStock('ADJ-POSITIVE-LOSS-001', 10);

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { variantId: variant.id, quantityDelta: 5, reasonCode: 'THEFT', note: 'This should be rejected' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires a non-empty note', async () => {
    const variant = await createVariantWithStock('ADJ-NO-NOTE-001', 10);

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { variantId: variant.id, quantityDelta: -1, reasonCode: 'DAMAGE', note: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('a cashier cannot post an adjustment', async () => {
    const variant = await createVariantWithStock('ADJ-CASHIER-001', 10);

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { variantId: variant.id, quantityDelta: -1, reasonCode: 'DAMAGE', note: 'Cashier attempt' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unrecognized reason code, e.g. SALE — not a manual-adjustment reason', async () => {
    const variant = await createVariantWithStock('ADJ-BAD-REASON-001', 10);

    const res = await app.inject({
      method: 'POST',
      url: '/inventory/adjustments',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { variantId: variant.id, quantityDelta: -1, reasonCode: 'SALE', note: 'Should not be a manual adjustment reason' },
    });
    expect(res.statusCode).toBe(400);
  });
});
