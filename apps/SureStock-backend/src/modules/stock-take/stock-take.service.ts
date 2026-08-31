import { Prisma, type StockTake, type StockTakeLine } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toPesewas } from '../../lib/money.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import { postMovement } from '../inventory/movement.service.js';
import { notifyLowStock } from '../notifications/notification.service.js';
import type {
  StartStockTakeBody,
  UpdateStockTakeLineBody,
  ListStockTakesQuery,
  ListStockTakeLinesQuery,
} from './stock-take.schemas.js';

function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, 'CONFLICT', message, details);
}

function serializeStockTake(st: StockTake & { starter: { name: string }; category: { name: string } | null; _count?: { lines: number } }) {
  return {
    id: st.id,
    locationId: st.locationId,
    scope: st.scope,
    categoryId: st.categoryId,
    categoryName: st.category?.name ?? null,
    status: st.status,
    startedBy: st.startedBy,
    startedByName: st.starter.name,
    startedAt: st.startedAt,
    postedAt: st.postedAt,
    lineCount: st._count?.lines,
  };
}

function serializeLine(line: StockTakeLine & { variant: { sku: string; variantName: string | null; product: { name: string } } }) {
  return {
    id: line.id,
    variantId: line.variantId,
    sku: line.variant.sku,
    productName: line.variant.product.name,
    variantName: line.variant.variantName,
    expectedQuantity: line.expectedQuantity.toNumber(),
    countedQuantity: line.countedQuantity?.toNumber() ?? null,
    variance: line.variance?.toNumber() ?? null,
    varianceValue: line.varianceValue !== null ? toPesewas(line.varianceValue) : null,
    reason: line.reason,
  };
}

const detailInclude = {
  starter: { select: { name: true } },
  category: { select: { name: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.StockTakeInclude;

/**
 * Doc 3 §4.2: "the system freezes an expected-quantity snapshot." One
 * `StockTakeLine` per in-scope, non-archived variant, `expectedQuantity`
 * copied from `quantityOnHand` at this exact moment — frozen for the
 * rest of the count, never re-read live. Only one IN_PROGRESS stock
 * take per location at a time (same "one active thing" rule as
 * TillShift), so two counts can never both try to adjust the same
 * variant.
 */
export async function startStockTake(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  body: StartStockTakeBody,
) {
  const existing = await prisma.stockTake.findFirst({ where: { locationId, status: 'IN_PROGRESS' } });
  if (existing) {
    throw conflict('A stock take is already in progress for this location — post or abandon it before starting another.', {
      stockTakeId: existing.id,
    });
  }

  if (body.scope === 'CATEGORY') {
    const category = await prisma.category.findFirst({ where: { id: body.categoryId!, locationId } });
    if (!category) throw notFound('Category not found.');
  }

  const variants = await prisma.productVariant.findMany({
    where: {
      locationId,
      archivedAt: null,
      ...(body.scope === 'CATEGORY' ? { product: { categoryId: body.categoryId } } : {}),
    },
    select: { id: true, quantityOnHand: true },
  });

  const id = generateId();
  const startedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.stockTake.create({
      data: { id, locationId, scope: body.scope, categoryId: body.scope === 'CATEGORY' ? body.categoryId : undefined, startedBy: userId, startedAt },
    });
    if (variants.length > 0) {
      await tx.stockTakeLine.createMany({
        data: variants.map((v) => ({ id: generateId(), stockTakeId: id, variantId: v.id, expectedQuantity: v.quantityOnHand })),
      });
    }
  });

  const created = await prisma.stockTake.findUniqueOrThrow({ where: { id }, include: detailInclude });
  return serializeStockTake(created);
}

async function getRawStockTake(prisma: typeof PrismaClient, locationId: string, id: string) {
  const st = await prisma.stockTake.findUnique({ where: { id }, include: detailInclude });
  if (!st || st.locationId !== locationId) throw notFound('Stock take not found.');
  return st;
}

export async function getStockTake(prisma: typeof PrismaClient, locationId: string, id: string, query: ListStockTakeLinesQuery) {
  const st = await getRawStockTake(prisma, locationId, id);

  const [lines, totalCount] = await Promise.all([
    prisma.stockTakeLine.findMany({
      where: { stockTakeId: id },
      orderBy: [{ id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { variant: { select: { sku: true, variantName: true, product: { select: { name: true } } } } },
    }),
    prisma.stockTakeLine.count({ where: { stockTakeId: id } }),
  ]);

  return {
    ...serializeStockTake(st),
    lines: lines.map(serializeLine),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
  };
}

export async function listStockTakes(prisma: typeof PrismaClient, locationId: string, query: ListStockTakesQuery) {
  const where: Prisma.StockTakeWhereInput = { locationId, ...(query.status ? { status: query.status } : {}) };

  const [rows, totalCount] = await Promise.all([
    prisma.stockTake.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: detailInclude,
    }),
    prisma.stockTake.count({ where }),
  ]);

  return {
    items: rows.map(serializeStockTake),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
  };
}

/**
 * Doc 3 §4.2: "counted lines show a live variance" — computed here
 * against the *frozen* `expectedQuantity`, purely for the counter's own
 * feedback and the review screen's discrepancy list. This is
 * deliberately never what gets posted to the ledger — see
 * `postStockTake`'s own comment for why those two numbers can honestly
 * differ.
 */
export async function updateStockTakeLine(
  prisma: typeof PrismaClient,
  locationId: string,
  id: string,
  lineId: string,
  body: UpdateStockTakeLineBody,
) {
  const st = await getRawStockTake(prisma, locationId, id);
  if (st.status !== 'IN_PROGRESS') throw conflict('This stock take is no longer in progress.');

  const line = await prisma.stockTakeLine.findUnique({ where: { id: lineId } });
  if (!line || line.stockTakeId !== id) throw notFound('Stock take line not found.');

  const countedQuantity = body.countedQuantity !== undefined ? new Prisma.Decimal(body.countedQuantity) : line.countedQuantity;
  let variance: Prisma.Decimal | null = line.variance;
  let varianceValue: Prisma.Decimal | null = line.varianceValue;

  if (countedQuantity !== null) {
    variance = countedQuantity.minus(line.expectedQuantity);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: line.variantId }, select: { costPrice: true } });
    varianceValue = variance.times(variant.costPrice);
  }

  const updated = await prisma.stockTakeLine.update({
    where: { id: lineId },
    data: { countedQuantity, variance, varianceValue, reason: body.reason ?? line.reason },
    include: { variant: { select: { sku: true, variantName: true, product: { select: { name: true } } } } },
  });
  return serializeLine(updated);
}

/** Doc 3 §4.2: "a review screen lists only the discrepancies, sorted by value impact." */
export async function getDiscrepancies(prisma: typeof PrismaClient, locationId: string, id: string) {
  await getRawStockTake(prisma, locationId, id);

  const lines = await prisma.stockTakeLine.findMany({
    where: { stockTakeId: id, countedQuantity: { not: null }, variance: { not: 0 } },
    include: { variant: { select: { sku: true, variantName: true, product: { select: { name: true } } } } },
  });

  return lines
    .map(serializeLine)
    .sort((a, b) => Math.abs(b.varianceValue ?? 0) - Math.abs(a.varianceValue ?? 0));
}

export async function abandonStockTake(prisma: typeof PrismaClient, locationId: string, id: string) {
  const st = await getRawStockTake(prisma, locationId, id);
  if (st.status !== 'IN_PROGRESS') throw conflict('Only an in-progress stock take can be abandoned.');

  const updated = await prisma.stockTake.update({ where: { id }, data: { status: 'ABANDONED' }, include: detailInclude });
  return serializeStockTake(updated);
}

/**
 * Doc 6 T-27: "posting writes adjustment movements and locks the
 * record; sales during a count are handled correctly." The second
 * clause is the one a naive implementation gets wrong: `expectedQuantity`
 * was frozen when the count *started*, but a sale (or a receipt) may
 * have moved `quantityOnHand` for real, legitimate reasons in the
 * meantime. Posting `countedQuantity - expectedQuantity` would silently
 * re-undo that sale. Instead, every counted line is locked (`FOR
 * UPDATE`) and adjusted against its *live* `quantityOnHand` at the
 * moment of posting — whatever happened in between is already correctly
 * reflected there, so the adjustment brings the ledger to exactly the
 * counted number regardless. The `variance`/`varianceValue` stored on
 * each line stay as the *review-time* story (counted vs. the original
 * snapshot) — a distinct, honestly-labeled fact from what actually got
 * posted, not silently overwritten to match.
 *
 * Only lines that were actually counted (`countedQuantity` set) get
 * adjusted; an uncounted line contributes no movement — a stock take
 * doesn't have to be fully completed to be posted.
 */
export async function postStockTake(prisma: typeof PrismaClient, locationId: string, userId: string, id: string) {
  const st = await getRawStockTake(prisma, locationId, id);
  if (st.status !== 'IN_PROGRESS') throw conflict('Only an in-progress stock take can be posted.');

  const lines = await prisma.stockTakeLine.findMany({
    where: { stockTakeId: id },
    include: { variant: { select: { sku: true } } },
  });

  const countedLines = lines.filter((l) => l.countedQuantity !== null);
  const missingReason = countedLines.filter((l) => l.variance && !l.variance.equals(0) && !l.reason);
  if (missingReason.length > 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Every discrepancy needs a reason before posting.', {
      lineIds: missingReason.map((l) => l.id),
    });
  }

  const lowStockVariantIds: string[] = [];

  const summary = await prisma.$transaction(async (tx) => {
    const adjustments: Array<{ variantId: string; sku: string; countedQuantity: number; previousQuantity: number; delta: number }> = [];

    for (const line of countedLines) {
      const [variant] = await tx.$queryRaw<{ id: string; quantity_on_hand: Prisma.Decimal; cost_price: Prisma.Decimal }[]>(Prisma.sql`
        SELECT id, quantity_on_hand, cost_price FROM product_variant WHERE id = ${line.variantId} FOR UPDATE
      `);
      if (!variant) continue; // variant removed since the count started — nothing left to adjust

      const delta = line.countedQuantity!.minus(variant.quantity_on_hand);
      if (!delta.equals(0)) {
        const { crossedLowStock } = await postMovement(tx, {
          variantId: line.variantId,
          quantityDelta: delta.toNumber(),
          reason: 'STOCK_TAKE_ADJUSTMENT',
          userId,
          referenceType: 'stock_take',
          referenceId: id,
          // So a shortfall found during a count has a real cost basis for
          // the Shrinkage report's "unexplained variance" figure — this
          // movement type never recorded one before (2026-08-24 fix).
          unitCost: toPesewas(variant.cost_price),
          note: line.reason ?? undefined,
        });
        if (crossedLowStock) lowStockVariantIds.push(line.variantId);
      }
      adjustments.push({
        variantId: line.variantId,
        sku: line.variant.sku,
        countedQuantity: line.countedQuantity!.toNumber(),
        previousQuantity: variant.quantity_on_hand.toNumber(),
        delta: delta.toNumber(),
      });
    }

    await tx.stockTake.update({ where: { id }, data: { status: 'POSTED', postedAt: new Date() } });

    if (adjustments.length > 0) {
      await tx.auditLog.create({
        data: {
          id: generateId(),
          userId,
          action: 'STOCK_TAKE_POSTED',
          entityType: 'stock_take',
          entityId: id,
          after: { adjustments, adjustedCount: adjustments.filter((a) => a.delta !== 0).length },
        },
      });
    }

    return adjustments;
  });

  if (lowStockVariantIds.length > 0) {
    notifyLowStock(prisma, locationId, lowStockVariantIds).catch(() => {});
  }

  const posted = await prisma.stockTake.findUniqueOrThrow({ where: { id }, include: detailInclude });
  return { ...serializeStockTake(posted), adjustments: summary };
}
