import { Prisma } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toDecimal, toPesewas, type Pesewas } from '../../lib/money.js';
import { notFound } from '../../lib/http-error.js';
import { postMovement } from './movement.service.js';
import type { ReceiveStockBody } from './receive.schemas.js';

/**
 * Doc 6 T-11: "receiving 10 units at a new cost updates the moving
 * average correctly." Standard weighted-average formula. A variant's
 * cached quantityOnHand can be zero or, in a rare offline-oversell edge
 * case, negative — neither has a coherent existing cost basis to weight
 * against, so both are clamped to zero here: the new cost becomes a
 * straight average of just the stock being added, same as a first-ever
 * receipt.
 */
function computeMovingAverageCost(
  currentQuantity: Prisma.Decimal,
  currentCost: Prisma.Decimal,
  receivedQuantity: number,
  receivedUnitCost: Pesewas,
): Prisma.Decimal {
  const existingQty = Prisma.Decimal.max(currentQuantity, 0);
  const receivedCost = toDecimal(receivedUnitCost);
  const totalQty = existingQty.plus(receivedQuantity);
  const totalValue = existingQty.times(currentCost).plus(new Prisma.Decimal(receivedQuantity).times(receivedCost));
  return totalValue.dividedBy(totalQty);
}

/**
 * Receives one or more lines in a single goods-received event — every
 * line's stock_movement shares one generated `referenceId` so they read
 * back as one delivery, not N unrelated movements, and the whole thing
 * commits as one transaction (Doc 5 §2: nothing here is real until all
 * of it is). The returned shape is deliberately complete enough to be
 * the "goods-received summary" T-11 asks be printable — rendering and
 * printing it is a frontend concern, not this endpoint's.
 */
export async function receiveStock(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  body: ReceiveStockBody,
) {
  const receivedAt = new Date();
  const receiptId = generateId();

  const lines = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const line of body.lines) {
      const variant = await tx.productVariant.findUnique({
        where: { id: line.variantId },
        include: { product: true },
      });
      if (!variant || variant.locationId !== locationId) {
        throw notFound(`Variant ${line.variantId} not found.`);
      }

      const newCost = computeMovingAverageCost(variant.quantityOnHand, variant.costPrice, line.quantity, line.unitCost);

      let batchId: string | undefined;
      if (variant.product.isPerishable) {
        const batch = await tx.batch.create({
          data: {
            id: generateId(),
            variantId: variant.id,
            batchCode: line.batchCode ?? `RCV-${receivedAt.toISOString().slice(0, 10)}-${variant.sku}`,
            expiryDate: line.expiryDate,
            quantityReceived: line.quantity,
            quantityRemaining: line.quantity,
            unitCost: toDecimal(line.unitCost),
          },
        });
        batchId = batch.id;
      }

      const { variant: updated } = await postMovement(tx, {
        variantId: variant.id,
        quantityDelta: line.quantity,
        reason: 'PURCHASE_RECEIVED',
        userId,
        referenceType: 'goods_received',
        referenceId: receiptId,
        unitCost: line.unitCost,
        batchId,
        note: line.note,
        occurredAt: receivedAt,
      });

      await tx.productVariant.update({ where: { id: variant.id }, data: { costPrice: newCost } });

      results.push({
        variantId: variant.id,
        sku: variant.sku,
        productId: variant.productId,
        productName: variant.product.name,
        quantityReceived: line.quantity,
        previousCostPrice: toPesewas(variant.costPrice),
        newCostPrice: toPesewas(newCost),
        quantityOnHand: updated.quantityOnHand.toNumber(),
        batchId: batchId ?? null,
        expiryDate: line.expiryDate ?? null,
      });
    }
    return results;
  });

  return {
    id: receiptId,
    supplierId: body.supplierId ?? null,
    receivedAt,
    receivedBy: userId,
    lines,
  };
}
