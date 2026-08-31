import type { Category, Product, ProductVariant, Supplier, UserRole } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toPesewas } from '../../lib/money.js';
import { HttpError } from '../../lib/http-error.js';
import { createSale } from '../sales/sale.service.js';
import type { CreateSaleBody } from '../sales/sale.schemas.js';
import type { SyncBatchBody } from './sync.schemas.js';

function serializeCategoryDelta(c: Category) {
  return { id: c.id, name: c.name, parentId: c.parentId, sortOrder: c.sortOrder, colour: c.colour, archivedAt: c.archivedAt, updatedAt: c.updatedAt };
}

function serializeSupplierDelta(s: Supplier) {
  return { id: s.id, name: s.name, archivedAt: s.archivedAt, updatedAt: s.updatedAt };
}

/**
 * Deliberately excludes `quantityOnHand` (and `reorderPoint`/
 * `reorderQuantity`, which exist to drive that same live number) — a
 * catalogue delta scoped for the offline cache, not a stock snapshot.
 * Doc 2 §3.2's own model already accepts that stock is allowed to be
 * wrong while offline ("stock may legitimately go negative... the
 * server accepts the sale"), so shipping a quantity that's stale the
 * moment it's cached would be a lie the client has no way to know is
 * stale — better to have no number at all than a confidently wrong one.
 * Cost price stays cashier-hidden, same rule as everywhere else it's returned.
 */
function serializeVariantDelta(v: ProductVariant, role: UserRole) {
  const base = {
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    barcode: v.barcode,
    variantName: v.variantName,
    sellingPrice: toPesewas(v.sellingPrice),
    archivedAt: v.archivedAt,
    updatedAt: v.updatedAt,
  };
  if (role === 'CASHIER') return base;
  return { ...base, costPrice: toPesewas(v.costPrice) };
}

function serializeProductDelta(p: Product & { variants: ProductVariant[] }, role: UserRole) {
  return {
    id: p.id,
    name: p.name,
    categoryId: p.categoryId,
    supplierId: p.supplierId,
    unit: p.unit,
    taxRateId: p.taxRateId,
    isPerishable: p.isPerishable,
    imageUrl: p.imageUrl,
    status: p.status,
    archivedAt: p.archivedAt,
    updatedAt: p.updatedAt,
    variants: p.variants.map((v) => serializeVariantDelta(v, role)),
  };
}

/**
 * Doc 2 §3.2 / T-21: "On login the device pulls the full catalogue...
 * refreshing by changed-since timestamp afterwards." `since` omitted
 * means a full pull (first-ever sync, or after clearing the local
 * cache). A product is included whenever *either* its own fields
 * changed *or* any of its variants did — a price-only edit (by far the
 * most common catalogue change, per T-06) bumps `ProductVariant.updatedAt`
 * without touching the parent `Product` row at all, so checking only
 * `Product.updatedAt` would silently miss it.
 */
export async function getCatalogueDelta(prisma: typeof PrismaClient, locationId: string, role: UserRole, since?: Date) {
  const serverTime = new Date();
  const changedSince = since ? { gt: since } : undefined;

  const [categories, suppliers, changedVariants, changedProducts] = await Promise.all([
    prisma.category.findMany({ where: { locationId, ...(changedSince ? { updatedAt: changedSince } : {}) } }),
    prisma.supplier.findMany({ where: { locationId, ...(changedSince ? { updatedAt: changedSince } : {}) } }),
    prisma.productVariant.findMany({
      where: { locationId, ...(changedSince ? { updatedAt: changedSince } : {}) },
      select: { productId: true },
    }),
    prisma.product.findMany({
      where: { locationId, ...(changedSince ? { updatedAt: changedSince } : {}) },
      select: { id: true },
    }),
  ]);

  const productIds = [...new Set([...changedVariants.map((v) => v.productId), ...changedProducts.map((p) => p.id)])];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds }, locationId }, include: { variants: { where: { locationId } } } })
    : [];

  return {
    serverTime: serverTime.toISOString(),
    categories: categories.map(serializeCategoryDelta),
    suppliers: suppliers.map(serializeSupplierDelta),
    products: products.map((p) => serializeProductDelta(p, role)),
  };
}

async function writeSyncFailure(prisma: typeof PrismaClient, saleBody: CreateSaleBody, err: HttpError) {
  await prisma.reviewQueueItem.create({
    data: {
      id: generateId(),
      type: 'SYNC_VALIDATION_FAILURE',
      reason: err.message,
      details: { attemptedSale: saleBody },
    },
  });
}

/**
 * Doc 6 T-22's drain endpoint. Each sale is its own `createSale()` call
 * (which opens its own transaction) — a batch is deliberately not
 * all-or-nothing, since one bad sale ten items deep in an offline
 * device's outbox shouldn't sink the other nineteen good ones.
 *
 * Only a well-formed `HttpError` (a real business-rule rejection —
 * missing manager override, a variant that no longer exists, malformed
 * totals) gets caught and turned into a T-23 review-queue entry; any
 * other error (a genuine infrastructure fault) is left to propagate, so
 * a transient failure surfaces as a real error and the device's outbox
 * correctly keeps the item queued for retry instead of the batch
 * quietly relabeling "the database hiccuped" as "a human needs to
 * decide this."
 */
export async function syncBatch(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  role: UserRole,
  body: SyncBatchBody,
) {
  const syncedAt = new Date();
  const results: Array<{ id: string; status: 'ok' | 'review'; message?: string }> = [];

  for (const saleBody of body.sales) {
    try {
      await createSale(prisma, locationId, userId, role, saleBody, { allowNegativeStock: true, syncedAt });
      results.push({ id: saleBody.id, status: 'ok' });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      await writeSyncFailure(prisma, saleBody, err);
      results.push({ id: saleBody.id, status: 'review', message: err.message });
    }
  }

  return { results };
}
