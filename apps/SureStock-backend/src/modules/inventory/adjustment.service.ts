import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { notFound } from '../../lib/http-error.js';
import { postMovement } from './movement.service.js';
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

  const { movement, variant: updated } = await prisma.$transaction(async (tx) => {
    const result = await postMovement(tx, {
      variantId: body.variantId,
      quantityDelta: body.quantityDelta,
      reason: body.reasonCode,
      userId,
      referenceType: 'adjustment',
      referenceId: auditId,
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
