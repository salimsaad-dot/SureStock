import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toPesewas } from '../../lib/money.js';
import { notFound } from '../../lib/http-error.js';
import { postMovement } from './movement.service.js';
import { notifyLowStock } from '../notifications/notification.service.js';
import type { CreateAdjustmentBody } from './adjustment.schemas.js';

/**
 * Doc 6 T-12: "every adjustment appears in the audit log with before and
 * after values." The audit log row and the stock_movement row share one
 * id (the audit row's own id, reused as the movement's referenceId) so
 * either one leads straight to the other — there's no separate
 * "adjustment" entity table; the audit log entry *is* the record of the
 * adjustment event, and the movement is its ledger consequence.
 */
export async function createAdjustment(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  body: CreateAdjustmentBody,
) {
  const variant = await prisma.productVariant.findUnique({ where: { id: body.variantId } });
  if (!variant || variant.locationId !== locationId) throw notFound('Variant not found.');

  const auditId = generateId();
  const previousQuantity = variant.quantityOnHand.toNumber();

  const { movement, variant: updated, crossedLowStock } = await prisma.$transaction(async (tx) => {
    const result = await postMovement(tx, {
      variantId: body.variantId,
      quantityDelta: body.quantityDelta,
      reason: body.reasonCode,
      userId,
      referenceType: 'adjustment',
      referenceId: auditId,
      // So DAMAGE/EXPIRY/THEFT losses have a real cost basis for the
      // Shrinkage report — this movement type never recorded one before
      // (2026-08-24 fix).
      unitCost: toPesewas(variant.costPrice),
      note: body.note,
    });

    await tx.auditLog.create({
      data: {
        id: auditId,
        userId,
        action: 'STOCK_ADJUSTMENT',
        entityType: 'product_variant',
        entityId: body.variantId,
        before: { quantityOnHand: previousQuantity },
        after: {
          quantityOnHand: result.variant.quantityOnHand.toNumber(),
          quantityDelta: body.quantityDelta,
          reasonCode: body.reasonCode,
          note: body.note,
          movementId: result.movement.id,
        },
      },
    });

    return result;
  });

  // Outside the transaction on purpose — see notification.service.ts's
  // own doc comment on why an SMS call must never happen inside a
  // transaction that's holding a row lock.
  if (crossedLowStock) {
    notifyLowStock(prisma, locationId, [body.variantId]).catch(() => {});
  }

  return {
    id: auditId,
    variantId: body.variantId,
    sku: variant.sku,
    reasonCode: body.reasonCode,
    note: body.note,
    quantityDelta: body.quantityDelta,
    previousQuantity,
    quantityOnHand: updated.quantityOnHand.toNumber(),
    movementId: movement.id,
    occurredAt: movement.occurredAt,
  };
}
