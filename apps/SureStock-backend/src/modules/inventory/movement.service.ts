import type { Prisma, MovementReason, UserRole } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toDecimal, toPesewas, type Pesewas } from '../../lib/money.js';
import { encodeCursor, decodeCursor } from '../../lib/cursor.js';
import { notFound } from '../../lib/http-error.js';
import type { ListMovementsQuery } from './movement.schemas.js';

export interface PostMovementInput {
  variantId: string;
  /** Decimal(12,3) — positive to add stock, negative to remove it. */
  quantityDelta: number;
  reason: MovementReason;
  userId: string;
  /** Doc 5 planned values: sale, purchase_order, stock_take, manual — 'import' has also crept in (T-08). Free text, not DB-enforced. */
  referenceType?: string;
  referenceId?: string;
  unitCost?: Pesewas;
  batchId?: string;
  note?: string;
  /** Defaults to now — a distinct backdating concept doesn't exist yet. */
  occurredAt?: Date;
}

/**
 * The one place a stock_movement row is ever written (Doc 5 §2, T-10).
 * Every writer — receiving, adjustments, sales, refunds, stock takes —
 * calls this inside its own transaction instead of hand-rolling
 * `tx.stockMovement.create` plus a separate `quantityOnHand` update, so
 * the ledger row and the cached running total can never be written as
 * two separate, potentially-inconsistent steps. `tx` must be the same
 * transaction client as whatever caused the movement — this function
 * doesn't open one itself, since it's meant to be one write among
 * several (e.g. a sale's lines, payment, and movements all committing
 * together).
 *
 * Deliberately does not guard against a negative resulting
 * `quantityOnHand` — whether that's allowed is a business rule that
 * belongs to the caller (e.g. T-16's online/offline sale-write
 * distinction), not something this shared primitive should decide for
 * every reason that will ever call it.
 */
export async function postMovement(tx: Prisma.TransactionClient, input: PostMovementInput) {
  const movement = await tx.stockMovement.create({
    data: {
      id: generateId(),
      variantId: input.variantId,
      quantityDelta: input.quantityDelta,
      reason: input.reason,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      unitCost: input.unitCost !== undefined ? toDecimal(input.unitCost) : undefined,
      batchId: input.batchId,
      note: input.note,
      userId: input.userId,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });

  // Returned so callers that need the fresh quantityOnHand right away
  // (e.g. to build an API response) don't have to re-fetch the variant.
  const variant = await tx.productVariant.update({
    where: { id: input.variantId },
    data: { quantityOnHand: { increment: input.quantityDelta } },
  });

  return { movement, variant };
}

interface MovementCursor {
  occurredAt: string;
  id: string;
}

/**
 * Doc 6 T-13: "movement history is paginated and filterable by reason."
 * Same cursor-pagination shape as T-07's product list (opaque,
 * keyset-based — never OFFSET, for the same never-skip-or-duplicate
 * reason). Ordered newest-first, since that's what a "history" view
 * actually wants; `id` breaks ties for movements sharing one
 * `occurredAt` (e.g. every line of one T-11 goods-received event does).
 */
export async function listVariantMovements(
  prisma: typeof PrismaClient,
  locationId: string,
  variantId: string,
  role: UserRole,
  query: ListMovementsQuery,
) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.locationId !== locationId) throw notFound('Variant not found.');

  const where: Prisma.StockMovementWhereInput = { variantId };
  if (query.reason) where.reason = query.reason;
  if (query.cursor) {
    const c = decodeCursor<MovementCursor>(query.cursor);
    const occurredAt = new Date(c.occurredAt);
    where.OR = [{ occurredAt: { lt: occurredAt } }, { occurredAt, id: { lt: c.id } }];
  }

  const rows = await prisma.stockMovement.findMany({
    where,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    include: { user: { select: { name: true } } },
  });

  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor<MovementCursor>({ occurredAt: last.occurredAt.toISOString(), id: last.id }) : null;

  return {
    items: page.map((m) => {
      const base = {
        id: m.id,
        quantityDelta: m.quantityDelta.toNumber(),
        reason: m.reason,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        batchId: m.batchId,
        note: m.note,
        userId: m.userId,
        userName: m.user.name,
        occurredAt: m.occurredAt,
      };
      // Same cashier-hides-cost rule as everywhere else (Doc 6 T-06) —
      // unitCost is the one field in a movement row that's cost data.
      if (role === 'CASHIER') return base;
      return { ...base, unitCost: m.unitCost !== null ? toPesewas(m.unitCost) : null };
    }),
    nextCursor,
  };
}

const DAYS_OF_COVER_WINDOW_DAYS = 30;

/**
 * Doc 6 T-13: "days-of-cover shown to permitted roles only." Derived
 * purely from the ledger's own SALE-reason movements over a trailing
 * window — no dependency on T-16 (the sale-write endpoint) existing yet,
 * since the ledger doesn't care which task produced a given movement.
 * Returns null rather than 0 or Infinity when there's no sales history
 * to estimate from — "no data" and "about to run out" need to look
 * different to whoever's reading this.
 */
export async function computeDaysOfCover(
  prisma: typeof PrismaClient,
  variantId: string,
  quantityOnHand: number,
): Promise<number | null> {
  const windowStart = new Date(Date.now() - DAYS_OF_COVER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.stockMovement.aggregate({
    where: { variantId, reason: 'SALE', occurredAt: { gte: windowStart } },
    _sum: { quantityDelta: true },
  });

  const totalSold = result._sum.quantityDelta?.toNumber() ?? 0; // SALE deltas are negative
  if (totalSold >= 0) return null;

  const dailyRate = Math.abs(totalSold) / DAYS_OF_COVER_WINDOW_DAYS;
  return Math.round((quantityOnHand / dailyRate) * 10) / 10;
}
