import type { Prisma, ReviewQueueItem } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import type { ListReviewQueueQuery, ResolveReviewQueueItemBody } from './review-queue.schemas.js';

function conflict(message: string): HttpError {
  return new HttpError(409, 'CONFLICT', message);
}

type ReviewQueueItemWithRelations = ReviewQueueItem & {
  sale: { receiptNumber: string; total: Prisma.Decimal } | null;
  variant: { sku: string } | null;
  resolver: { name: string } | null;
};

function serializeReviewQueueItem(item: ReviewQueueItemWithRelations) {
  return {
    id: item.id,
    type: item.type,
    saleId: item.saleId,
    saleReceiptNumber: item.sale?.receiptNumber ?? null,
    variantId: item.variantId,
    variantSku: item.variant?.sku ?? null,
    reason: item.reason,
    details: item.details,
    createdAt: item.createdAt,
    resolvedAt: item.resolvedAt,
    resolvedBy: item.resolvedBy,
    resolvedByName: item.resolver?.name ?? null,
    resolutionNote: item.resolutionNote,
  };
}

const include = {
  sale: { select: { receiptNumber: true, total: true } },
  variant: { select: { sku: true } },
  resolver: { select: { name: true } },
} satisfies Prisma.ReviewQueueItemInclude;

/** Doc 6 T-23. Manager/Owner-gated (matches every other "manage" surface) — defaults to open items only, since a review queue is meant to be worked down to zero, not paged through as history. */
export async function listReviewQueue(prisma: typeof PrismaClient, query: ListReviewQueueQuery) {
  const where: Prisma.ReviewQueueItemWhereInput = {};
  if (query.status === 'open') where.resolvedAt = null;
  else if (query.status === 'resolved') where.resolvedAt = { not: null };

  const [rows, totalCount] = await Promise.all([
    prisma.reviewQueueItem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include,
    }),
    prisma.reviewQueueItem.count({ where }),
  ]);

  return {
    items: rows.map(serializeReviewQueueItem),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
  };
}

export async function resolveReviewQueueItem(
  prisma: typeof PrismaClient,
  userId: string,
  id: string,
  body: ResolveReviewQueueItemBody,
) {
  const existing = await prisma.reviewQueueItem.findUnique({ where: { id } });
  if (!existing) throw notFound('Review item not found.');
  if (existing.resolvedAt) throw conflict('This item has already been resolved.');

  const updated = await prisma.reviewQueueItem.update({
    where: { id },
    data: { resolvedAt: new Date(), resolvedBy: userId, resolutionNote: body.note },
    include,
  });
  return serializeReviewQueueItem(updated);
}
