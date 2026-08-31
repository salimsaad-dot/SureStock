import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import type { FastifyInstance } from 'fastify';
import type { MovementReason } from '@prisma/client';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { postMovement } from './movement.service.js';

const MOVEMENT_REASONS: MovementReason[] = [
  'SALE',
  'REFUND',
  'PURCHASE_RECEIVED',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DAMAGE',
  'EXPIRY',
  'THEFT',
  'STOCK_TAKE_ADJUSTMENT',
  'OPENING_BALANCE',
];

describe('stock movement ledger (T-10)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let productId: string;
  let userId: string;
  const createdVariantIds: string[] = [];

  async function createVariant(sku: string) {
    const variant = await app.prisma.productVariant.create({
      data: {
        id: generateId(),
        productId,
        sku,
        costPrice: 100,
        sellingPrice: 200,
        quantityOnHand: 0,
        locationId,
      },
    });
    createdVariantIds.push(variant.id);
    return variant;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Movement Test Shop', currency: 'GHS' } });

    userId = generateId();
    await app.prisma.user.create({
      data: {
        id: userId,
        name: 'Movement Test User',
        email: `movement-owner-${generateId()}@test.surestock.local`,
        passwordHash: await hashPassword('movement-test-password'),
        role: 'OWNER',
        locationId,
      },
    });

    const product = await app.prisma.product.create({
      data: { id: generateId(), locationId, name: 'Movement Test Product', unit: 'EACH' },
    });
    productId = product.id;
  });

  afterAll(async () => {
    // stock_movement's RESTRICT foreign keys mean every variant/product/
    // user touched by a real movement in this file is permanently pinned
    // — same reasoning as product.test.ts's afterAll. Left behind in the
    // throwaway test database rather than fought.
    await app.close();
  });

  it('posts a movement and increments quantityOnHand by the delta', async () => {
    const variant = await createVariant('MOVE-BASIC-001');

    const { movement, variant: updated } = await app.prisma.$transaction((tx) =>
      postMovement(tx, {
        variantId: variant.id,
        quantityDelta: 12,
        reason: 'PURCHASE_RECEIVED',
        userId,
        referenceType: 'purchase_order',
        referenceId: generateId(),
        unitCost: 850,
        note: 'Delivery from supplier',
      }),
    );

    expect(movement.quantityDelta.toNumber()).toBe(12);
    expect(movement.reason).toBe('PURCHASE_RECEIVED');
    expect(movement.unitCost?.toNumber()).toBe(8.5);
    expect(movement.note).toBe('Delivery from supplier');
    expect(updated.quantityOnHand.toNumber()).toBe(12);

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(12);
  });

  it('a negative delta decrements quantityOnHand, and can go negative', async () => {
    const variant = await createVariant('MOVE-NEG-001');

    await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: 5, reason: 'OPENING_BALANCE', userId }),
    );
    const { variant: afterSale } = await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: -7, reason: 'SALE', userId, referenceType: 'sale' }),
    );

    // Deliberately not rejected here — whether negative stock is allowed
    // is a caller-level business rule (T-16), not this primitive's job.
    expect(afterSale.quantityOnHand.toNumber()).toBe(-2);
  });

  it('stock_movement rows can never be updated or deleted, even by the app', async () => {
    const variant = await createVariant('MOVE-APPEND-ONLY-001');
    const { movement } = await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: 3, reason: 'OPENING_BALANCE', userId }),
    );

    await expect(
      app.prisma.stockMovement.update({ where: { id: movement.id }, data: { note: 'sneaky edit' } }),
    ).rejects.toThrow();

    await expect(app.prisma.stockMovement.delete({ where: { id: movement.id } })).rejects.toThrow();

    // The row is still exactly as posted — the rejected statements didn't
    // partially apply.
    const stillThere = await app.prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } });
    expect(stillThere.note).toBeNull();
  });

  it(
    'ledger invariant: the sum of quantityDelta always equals quantityOnHand, after every step of a random sequence (T-10 acceptance criterion)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              reason: fc.constantFrom(...MOVEMENT_REASONS),
              quantityDelta: fc.integer({ min: -50, max: 50 }).filter((n) => n !== 0),
            }),
            { minLength: 1, maxLength: 20 },
          ),
          async (steps) => {
            const variant = await createVariant(`MOVE-PBT-${generateId()}`);

            for (const step of steps) {
              await app.prisma.$transaction((tx) =>
                postMovement(tx, {
                  variantId: variant.id,
                  quantityDelta: step.quantityDelta,
                  reason: step.reason,
                  userId,
                }),
              );

              const [sum, current] = await Promise.all([
                app.prisma.stockMovement.aggregate({
                  where: { variantId: variant.id },
                  _sum: { quantityDelta: true },
                }),
                app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } }),
              ]);

              expect(current.quantityOnHand.toNumber()).toBe(sum._sum.quantityDelta?.toNumber() ?? 0);
            }
          },
        ),
        { numRuns: 15 },
      );
    },
    30_000,
  );
});
