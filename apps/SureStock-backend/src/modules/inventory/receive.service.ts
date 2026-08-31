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

export interface ReceiveVariantLineInput {
  variantId: string;
  quantity: number;
  unitCost: Pesewas;
  batchCode?: string;
  expiryDate?: Date;
  note?: string;
  userId: string;
  referenceType: string;
  referenceId: string;
  occurredAt: Date;
}

/**
 * The one place a single variant's stock actually gets received — the
 * moving-average cost recalculation, perishable batch creation, and the
 * `postMovement()` ledger write. Extracted so T-28 (Purchasing, PO-linked
 * receiving) can share this exact logic with T-11's own standalone
 * receive endpoint below instead of a second copy drifting out of sync;
 * the two differ only in what `referenceType`/`referenceId` they stamp
 * and what they do with the PO-line bookkeeping afterward, which is the
 * caller's concern, not this function's.
 */
export async function receiveVariantLine(
  tx: Prisma.TransactionClient,
  locationId: string,
  input: ReceiveVariantLineInput,
) {
  const variant = await tx.productVariant.findUnique({
    where: { id: input.variantId },
    include: { product: true },
  });
  if (!variant || variant.locationId !== locationId) {
    throw notFound(`Variant ${input.variantId} not found.`);
  }

  const newCost = computeMovingAverageCost(variant.quantityOnHand, variant.costPrice, input.quantity, input.unitCost);

  let batchId: string | undefined;
  if (variant.product.isPerishable) {
    const batch = await tx.batch.create({
      data: {
        id: generateId(),
        variantId: variant.id,
        batchCode: input.batchCode ?? `RCV-${input.occurredAt.toISOString().slice(0, 10)}-${variant.sku}`,
        expiryDate: input.expiryDate,
        quantityReceived: input.quantity,
        quantityRemaining: input.quantity,
        unitCost: toDecimal(input.unitCost),
      },
    });
    batchId = batch.id;
  }

  const { variant: updated } = await postMovement(tx, {
    variantId: variant.id,
    quantityDelta: input.quantity,
    reason: 'PURCHASE_RECEIVED',
    userId: input.userId,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    unitCost: input.unitCost,
    batchId,
    note: input.note,
    occurredAt: input.occurredAt,
  });

  await tx.productVariant.update({ where: { id: variant.id }, data: { costPrice: newCost } });

  return {
    variantId: variant.id,
    sku: variant.sku,
    productId: variant.productId,
    productName: variant.product.name,
    quantityReceived: input.quantity,
    previousCostPrice: toPesewas(variant.costPrice),
    newCostPrice: toPesewas(newCost),
    quantityOnHand: updated.quantityOnHand.toNumber(),
    batchId: batchId ?? null,
    expiryDate: input.expiryDate ?? null,
  };
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
      results.push(
        await receiveVariantLine(tx, locationId, {
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          batchCode: line.batchCode,
          expiryDate: line.expiryDate,
          note: line.note,
          userId,
          referenceType: 'goods_received',
          referenceId: receiptId,
          occurredAt: receivedAt,
        }),
      );
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
