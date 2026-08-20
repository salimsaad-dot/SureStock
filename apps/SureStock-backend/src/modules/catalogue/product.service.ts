import { Prisma, type Product, type ProductVariant, type UserRole } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toDecimal, toPesewas } from '../../lib/money.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import { encodeCursor, decodeCursor } from '../../lib/cursor.js';
import { matchScore } from './search.js';
import { postMovement, computeDaysOfCover } from '../inventory/movement.service.js';
import type {
  CreateProductBody,
  UpdateProductBody,
  UpdateVariantBody,
  VariantInput,
  ListProductsQuery,
  PopularProductsQuery,
  RecentProductsQuery,
} from './product.schemas.js';

function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, 'CONFLICT', message, details);
}

/**
 * The classic Prisma docs describe P2002's constraint name as living at
 * `error.meta.target`. Confirmed empirically against this exact stack
 * (Prisma 7's no-rust-engine client + @prisma/adapter-mariadb on
 * MariaDB 10.4) that it doesn't: the real detail is nested inside
 * `meta.driverAdapterError.cause.constraint.index`. `target` is checked
 * first anyway, in case a different connector or a future Prisma
 * version uses the documented shape.
 */
function extractConstraintName(err: Prisma.PrismaClientKnownRequestError): string {
  const meta = err.meta as Record<string, unknown> | undefined;
  const target = meta?.target;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.join(',');

  const driverError = meta?.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverError?.cause as Record<string, unknown> | undefined;
  const constraint = cause?.constraint as Record<string, unknown> | undefined;
  if (typeof constraint?.index === 'string') return constraint.index;
  if (typeof cause?.originalMessage === 'string') return cause.originalMessage;

  return '';
}

/**
 * Doc 6, T-06: "duplicate SKU or barcode is rejected with a clear
 * message." Prisma surfaces both as the same generic P2002, so this is
 * the one place that gets translated into which field actually
 * collided, for every route that creates or updates a variant.
 */
function translateUniqueConstraintError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const constraintName = extractConstraintName(err);
    if (constraintName.includes('barcode')) {
      throw conflict('That barcode is already used by another product.');
    }
    if (constraintName.includes('sku')) {
      throw conflict('That SKU is already used by another product at this location.');
    }
  }
  throw err;
}

/** cost price hidden from cashiers — Doc 6 T-06 — in the API response
 * itself, not left to the client to decide not to render. */
function serializeVariant(variant: ProductVariant, role: UserRole, productName?: string) {
  const base = {
    id: variant.id,
    productId: variant.productId,
    sku: variant.sku,
    barcode: variant.barcode,
    variantName: variant.variantName,
    ...(productName !== undefined ? { productName } : {}),
    sellingPrice: toPesewas(variant.sellingPrice),
    quantityOnHand: variant.quantityOnHand.toNumber(),
    reorderPoint: variant.reorderPoint?.toNumber() ?? null,
    reorderQuantity: variant.reorderQuantity?.toNumber() ?? null,
    locationId: variant.locationId,
    archivedAt: variant.archivedAt,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  };
  if (role === 'CASHIER') return base;
  return { ...base, costPrice: toPesewas(variant.costPrice) };
}

function serializeProduct(product: Product & { variants: ProductVariant[] }, role: UserRole) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    supplierId: product.supplierId,
    unit: product.unit,
    taxRateId: product.taxRateId,
    isPerishable: product.isPerishable,
    imageUrl: product.imageUrl,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    variants: product.variants.map((v) => serializeVariant(v, role)),
  };
}

async function createVariantInTx(
  tx: Prisma.TransactionClient,
  productId: string,
  locationId: string,
  userId: string,
  input: VariantInput,
) {
  const variant = await tx.productVariant.create({
    data: {
      id: generateId(),
      productId,
      sku: input.sku,
      barcode: input.barcode,
      variantName: input.variantName,
      costPrice: toDecimal(input.costPrice),
      sellingPrice: toDecimal(input.sellingPrice),
      // Always starts at 0 — a non-zero opening quantity is posted as a
      // real OPENING_BALANCE movement below (via T-10's postMovement),
      // never written directly. quantityOnHand is a cache of the ledger,
      // never a second source of truth (Doc 5 §2), not even at row birth.
      quantityOnHand: 0,
      reorderPoint: input.reorderPoint,
      reorderQuantity: input.reorderQuantity,
      locationId,
    },
  });

  if (input.openingQuantity && input.openingQuantity > 0) {
    const { variant: updated } = await postMovement(tx, {
      variantId: variant.id,
      quantityDelta: input.openingQuantity,
      reason: 'OPENING_BALANCE',
      referenceType: 'manual',
      userId,
    });
    return updated;
  }

  return variant;
}

export async function createProduct(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  role: UserRole,
  body: CreateProductBody,
) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          id: generateId(),
          name: body.name,
          description: body.description,
          categoryId: body.categoryId,
          supplierId: body.supplierId,
          unit: body.unit ?? 'EACH',
          taxRateId: body.taxRateId,
          isPerishable: body.isPerishable ?? false,
          imageUrl: body.imageUrl,
        },
      });

      const variants: ProductVariant[] = [];
      for (const variantInput of body.variants) {
        variants.push(await createVariantInTx(tx, product.id, locationId, userId, variantInput));
      }

      return { ...product, variants };
    });
    return serializeProduct(created, role);
  } catch (err) {
    return translateUniqueConstraintError(err);
  }
}

export async function addVariant(
  prisma: typeof PrismaClient,
  productId: string,
  locationId: string,
  userId: string,
  role: UserRole,
  input: VariantInput,
) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound('Product not found.');

  try {
    const variant = await prisma.$transaction((tx) => createVariantInTx(tx, productId, locationId, userId, input));
    return serializeVariant(variant, role);
  } catch (err) {
    return translateUniqueConstraintError(err);
  }
}

/** Doc 6 T-13: margin — undefined (not 0%) when sellingPrice is 0, since a ratio against zero isn't a real margin. */
function computeMarginPercent(costPricePesewas: number, sellingPricePesewas: number): number | null {
  if (sellingPricePesewas <= 0) return null;
  return Math.round(((sellingPricePesewas - costPricePesewas) / sellingPricePesewas) * 1000) / 10;
}

export async function getProduct(prisma: typeof PrismaClient, id: string, role: UserRole) {
  const product = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!product) throw notFound('Product not found.');
  const serialized = serializeProduct(product, role);

  // Doc 6 T-13: "margin and days-of-cover shown to permitted roles only"
  // — the same cashier gate as costPrice itself, since neither means
  // anything without it. daysOfCover is a ledger read (T-13 depends only
  // on T-10, not T-16), computed via the inventory module's own service
  // function rather than this module reaching into stock_movement
  // directly (Doc 2 §3's module-boundary rule).
  if (role === 'CASHIER') return serialized;

  const costByVariantId = new Map(product.variants.map((v) => [v.id, toPesewas(v.costPrice)]));
  const variants = await Promise.all(
    serialized.variants.map(async (variant) => ({
      ...variant,
      marginPercent: computeMarginPercent(costByVariantId.get(variant.id)!, variant.sellingPrice),
      daysOfCover: await computeDaysOfCover(prisma, variant.id, variant.quantityOnHand),
    })),
  );

  return { ...serialized, variants };
}

type StockLevel = 'IN_STOCK' | 'LOW' | 'OUT';

function variantStockLevel(quantityOnHand: Prisma.Decimal, reorderPoint: Prisma.Decimal | null): StockLevel {
  if (quantityOnHand.lte(0)) return 'OUT';
  if (reorderPoint !== null && quantityOnHand.lte(reorderPoint)) return 'LOW';
  return 'IN_STOCK';
}

interface BrowseCursor {
  kind: 'browse';
  name: string;
  id: string;
}
interface SearchCursor {
  kind: 'search';
  score: number;
  id: string;
}

interface CandidateVariant {
  sku: string;
  quantityOnHand: Prisma.Decimal;
  reorderPoint: Prisma.Decimal | null;
}
interface Candidate {
  id: string;
  name: string;
  variants: CandidateVariant[];
}

/**
 * Doc 6, T-07: search, category/status/stock-level filters (combined),
 * and cursor pagination, in one pass. Filtering, fuzzy-scoring, and
 * sorting run in application code rather than as SQL, for two reasons
 * that both come back to the same limits: (1) "stock level" means
 * comparing quantityOnHand to reorderPoint, two columns on the same
 * row, which Prisma's filter objects can't express as a predicate;
 * (2) typo-tolerant search has no database feature to lean on here at
 * all (see search.ts).
 *
 * Getting under the 150ms target at 3,000 rows took two rounds, both
 * proven by the timed test rather than assumed:
 *  1. Select only the handful of fields scoring needs (id, name, sku,
 *     quantityOnHand, reorderPoint) instead of full rows — the first
 *     version used `include: { variants: true }`, hydrating a Decimal
 *     for costPrice/sellingPrice/reorderQuantity on every variant of
 *     every candidate, most of which were then thrown away unread.
 *  2. Even with that trim, Prisma's query builder took ~150-250ms to
 *     fetch and hydrate 3,000 rows — measured directly against the
 *     identical raw SQL, which took ~20-30ms. That gap is Prisma's own
 *     JS-based query compilation and result mapping, not MariaDB or the
 *     driver. Doc 2 §2 names this escape hatch explicitly ("raw SQL
 *     stays available for reporting queries") — this candidate fetch is
 *     exactly that case, so it uses $queryRaw. Everything downstream
 *     (scoring, paging, and the final ~20-row hydration) stays on the
 *     ORM, where its overhead is negligible.
 */
export async function listProducts(
  prisma: typeof PrismaClient,
  locationId: string,
  role: UserRole,
  query: ListProductsQuery,
) {
  const conditions = [Prisma.sql`pv.location_id = ${locationId}`, Prisma.sql`p.archived_at IS NULL`];
  if (query.categoryId) conditions.push(Prisma.sql`p.category_id = ${query.categoryId}`);
  if (query.status) conditions.push(Prisma.sql`p.status = ${query.status}`);

  const flatRows = await prisma.$queryRaw<
    Array<{
      product_id: string;
      name: string;
      sku: string;
      quantity_on_hand: Prisma.Decimal;
      reorder_point: Prisma.Decimal | null;
    }>
  >(Prisma.sql`
    SELECT p.id AS product_id, p.name, pv.sku, pv.quantity_on_hand, pv.reorder_point
    FROM product_variant pv
    JOIN product p ON p.id = pv.product_id
    WHERE ${Prisma.join(conditions, ' AND ')}
  `);

  const byProduct = new Map<string, Candidate>();
  for (const r of flatRows) {
    let p = byProduct.get(r.product_id);
    if (!p) {
      p = { id: r.product_id, name: r.name, variants: [] };
      byProduct.set(r.product_id, p);
    }
    p.variants.push({ sku: r.sku, quantityOnHand: r.quantity_on_hand, reorderPoint: r.reorder_point });
  }

  let rows = [...byProduct.values()];
  if (query.stockLevel) {
    rows = rows.filter((p) =>
      p.variants.some((v) => variantStockLevel(v.quantityOnHand, v.reorderPoint) === query.stockLevel),
    );
  }

  let pageIds: string[];
  let nextCursor: string | null;

  if (query.q) {
    const scored = rows
      .map((p) => ({ id: p.id, score: matchScore(query.q!, [p.name, ...p.variants.map((v) => v.sku)]) }))
      .filter((r): r is { id: string; score: number } => r.score !== null);
    scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));

    let startAt = 0;
    if (query.cursor) {
      const c = decodeCursor<SearchCursor>(query.cursor);
      startAt = scored.findIndex((r) => r.score > c.score || (r.score === c.score && r.id > c.id));
      if (startAt === -1) startAt = scored.length;
    }
    const page = scored.slice(startAt, startAt + query.limit);
    const last = page.at(-1);
    pageIds = page.map((r) => r.id);
    nextCursor =
      startAt + query.limit < scored.length && last
        ? encodeCursor<SearchCursor>({ kind: 'search', score: last.score, id: last.id })
        : null;
  } else {
    rows = [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    let startAt = 0;
    if (query.cursor) {
      const c = decodeCursor<BrowseCursor>(query.cursor);
      startAt = rows.findIndex((p) => p.name > c.name || (p.name === c.name && p.id > c.id));
      if (startAt === -1) startAt = rows.length;
    }
    const page = rows.slice(startAt, startAt + query.limit);
    const last = page.at(-1);
    pageIds = page.map((p) => p.id);
    nextCursor =
      startAt + query.limit < rows.length && last
        ? encodeCursor<BrowseCursor>({ kind: 'browse', name: last.name, id: last.id })
        : null;
  }

  // Full hydration only for the page actually being returned.
  const fullPage = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    include: { variants: { where: { locationId } } },
  });
  const byId = new Map(fullPage.map((p) => [p.id, p]));
  const items = pageIds.map((id) => serializeProduct(byId.get(id)!, role));

  return { items, nextCursor };
}

export async function lookupByBarcode(prisma: typeof PrismaClient, locationId: string, role: UserRole, barcode: string) {
  const variant = await prisma.productVariant.findUnique({ where: { barcode }, include: { product: true } });
  // A variant belonging to another location isn't just filtered out of
  // this result — it doesn't exist as far as this location's scanner is
  // concerned, so the response is the same as a barcode that matches
  // nothing at all, not a different kind of not-found.
  if (!variant || variant.locationId !== locationId) throw notFound('No product with that barcode at this location.');
  return serializeVariant(variant, role, variant.product.name);
}

interface SellTileRow {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  selling_price: Prisma.Decimal;
  quantity_on_hand: Prisma.Decimal;
  image_url: string | null;
}

function serializeSellTile(row: SellTileRow) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    sellingPrice: toPesewas(row.selling_price),
    quantityOnHand: row.quantity_on_hand.toNumber(),
    imageUrl: row.image_url,
  };
}

/**
 * Doc 3 App Flow §3: the Sell screen's "grid of category tiles and
 * favourite products." Never defined further in any planning doc, so
 * "favourite/popular" is grounded in the one real signal that exists —
 * actual sales volume — rather than invented. Ranked by units sold
 * (SALE-reason stock_movement rows) over a trailing 30 days; active
 * products with zero sales in that window still appear (a fresh shop
 * has no sales history yet), just ranked last, alphabetically among
 * themselves for a stable, sensible order.
 */
export async function getPopularProducts(prisma: typeof PrismaClient, locationId: string, query: PopularProductsQuery) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<SellTileRow[]>(Prisma.sql`
    SELECT pv.id, pv.product_id, p.name AS product_name, pv.sku, pv.selling_price, pv.quantity_on_hand, p.image_url,
           COALESCE(SUM(CASE WHEN sm.reason = 'SALE' AND sm.occurred_at >= ${cutoff} THEN -sm.quantity_delta ELSE 0 END), 0) AS total_sold
    FROM product_variant pv
    JOIN product p ON p.id = pv.product_id
    LEFT JOIN stock_movement sm ON sm.variant_id = pv.id
    WHERE pv.location_id = ${locationId} AND pv.archived_at IS NULL AND p.status = 'ACTIVE'
    ${query.categoryId ? Prisma.sql`AND p.category_id = ${query.categoryId}` : Prisma.empty}
    GROUP BY pv.id, pv.product_id, p.name, pv.sku, pv.selling_price, pv.quantity_on_hand, p.image_url
    ORDER BY total_sold DESC, p.name ASC
    LIMIT ${query.limit}
  `);
  return rows.map(serializeSellTile);
}

/**
 * Doc 3 App Flow §3's "Recent Products" — real recently-sold distinct
 * products (from actual `sale_line` rows), not a client-side "recently
 * clicked" list, so it's useful to every cashier on the till, not just
 * whoever's browser it is. Refund lines are excluded — a refund isn't
 * a customer buying something, and would otherwise resurface an old
 * product just because it got returned.
 */
export async function getRecentProducts(prisma: typeof PrismaClient, locationId: string, query: RecentProductsQuery) {
  const rows = await prisma.$queryRaw<SellTileRow[]>(Prisma.sql`
    SELECT pv.id, pv.product_id, p.name AS product_name, pv.sku, pv.selling_price, pv.quantity_on_hand, p.image_url,
           MAX(s.sold_at) AS last_sold_at
    FROM sale_line sl
    JOIN sale s ON s.id = sl.sale_id
    JOIN product_variant pv ON pv.id = sl.variant_id
    JOIN product p ON p.id = pv.product_id
    WHERE s.location_id = ${locationId} AND s.refund_of_sale_id IS NULL AND pv.archived_at IS NULL AND p.status = 'ACTIVE'
    GROUP BY pv.id, pv.product_id, p.name, pv.sku, pv.selling_price, pv.quantity_on_hand, p.image_url
    ORDER BY last_sold_at DESC
    LIMIT ${query.limit}
  `);
  return rows.map(serializeSellTile);
}

export async function updateProduct(prisma: typeof PrismaClient, id: string, role: UserRole, body: UpdateProductBody) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFound('Product not found.');

  const updated = await prisma.product.update({
    where: { id },
    data: body,
    include: { variants: true },
  });
  return serializeProduct(updated, role);
}

export async function updateProductStatus(
  prisma: typeof PrismaClient,
  id: string,
  role: UserRole,
  status: Product['status'],
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFound('Product not found.');
  const updated = await prisma.product.update({ where: { id }, data: { status }, include: { variants: true } });
  return serializeProduct(updated, role);
}

/**
 * Doc 6, T-06: "a price change writes a price_history row." Scoped to
 * sellingPrice specifically — cost price moves through the
 * moving-average mechanism on receiving stock (Doc 2 §3.3, built in a
 * later task), not through manual edits here, so it isn't logged the
 * same way. A reason is required whenever the selling price actually
 * changes, matching Doc 3's cart-discount pattern of never letting a
 * price move without one.
 */
export async function updateVariant(
  prisma: typeof PrismaClient,
  variantId: string,
  userId: string,
  role: UserRole,
  body: UpdateVariantBody,
) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw notFound('Variant not found.');

  const sellingPriceChanging = body.sellingPrice !== undefined && toPesewas(existing.sellingPrice) !== body.sellingPrice;
  if (sellingPriceChanging && !body.priceChangeReason) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A reason is required when changing the selling price.');
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const newSellingPrice = body.sellingPrice !== undefined ? toDecimal(body.sellingPrice) : undefined;

      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: {
          sku: body.sku,
          barcode: body.barcode,
          variantName: body.variantName,
          costPrice: body.costPrice !== undefined ? toDecimal(body.costPrice) : undefined,
          sellingPrice: newSellingPrice,
          reorderPoint: body.reorderPoint,
          reorderQuantity: body.reorderQuantity,
        },
      });

      if (sellingPriceChanging && newSellingPrice) {
        await tx.priceHistory.create({
          data: {
            id: generateId(),
            variantId,
            oldPrice: existing.sellingPrice,
            newPrice: newSellingPrice,
            changedBy: userId,
            changedAt: new Date(),
            reason: body.priceChangeReason,
          },
        });
      }

      return variant;
    });
    return serializeVariant(updated, role);
  } catch (err) {
    return translateUniqueConstraintError(err);
  }
}
