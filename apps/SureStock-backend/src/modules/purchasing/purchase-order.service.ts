import { Prisma } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toPesewas, type Pesewas } from '../../lib/money.js';
import { notFound, HttpError } from '../../lib/http-error.js';
import { getTotalPurchased } from '../reports/reports.service.js';
import { receiveVariantLine } from '../inventory/receive.service.js';
import type {
  CreatePurchaseOrderBody,
  UpdatePurchaseOrderBody,
  ReceivePurchaseOrderBody,
  ListPurchaseOrdersQuery,
  PurchaseOrderStatsQuery,
  PurchaseOrderLineInput,
} from './purchase-order.schemas.js';

function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, 'CONFLICT', message, details);
}

/**
 * A true DB-assigned sequence (`orderSeq`), not an id fragment like
 * receipts (`RCT-<id fragment>`) — the mockup's PO numbers are
 * genuinely sequential (PO-1024, PO-1023...), a deliberate product
 * decision distinct from receipts, which never needed to look
 * sequential. Computed at read time, never stored — see the schema
 * comment on `PurchaseOrder.orderSeq`.
 */
function orderNumberOf(orderSeq: number): string {
  return `PO-${1000 + orderSeq}`;
}

function lineTotalCedis(quantity: number, unitCost: Pesewas): Prisma.Decimal {
  return new Prisma.Decimal(quantity).times(unitCost).dividedBy(100);
}

async function validateLines(prisma: typeof PrismaClient, locationId: string, lines: PurchaseOrderLineInput[]) {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  for (const line of lines) {
    const variant = byId.get(line.variantId);
    if (!variant || variant.locationId !== locationId) {
      throw notFound(`Variant ${line.variantId} not found.`);
    }
  }
}

type PoWithLinesAndRelations = Prisma.PurchaseOrderGetPayload<{
  include: {
    supplier: { select: { name: true } };
    creator: { select: { name: true } };
    lines: { include: { variant: { include: { product: { select: { name: true } } } } } };
  };
}>;

const detailInclude = {
  supplier: { select: { name: true } },
  creator: { select: { name: true } },
  lines: { include: { variant: { include: { product: { select: { name: true } } } } } },
} satisfies Prisma.PurchaseOrderInclude;

function serializePurchaseOrder(po: PoWithLinesAndRelations) {
  return {
    id: po.id,
    orderNumber: orderNumberOf(po.orderSeq),
    supplierId: po.supplierId,
    supplierName: po.supplier.name,
    status: po.status,
    expectedDate: po.expectedDate,
    totalCost: po.totalCost !== null ? toPesewas(po.totalCost) : null,
    itemCount: po.lines.length,
    createdBy: po.createdBy,
    createdByName: po.creator.name,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
    lines: po.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      sku: line.variant.sku,
      productName: line.variant.product.name,
      variantName: line.variant.variantName,
      quantityOrdered: line.quantityOrdered.toNumber(),
      quantityReceived: line.quantityReceived.toNumber(),
      unitCost: toPesewas(line.unitCost),
      lineTotal: toPesewas(lineTotalCedis(line.quantityOrdered.toNumber(), toPesewas(line.unitCost))),
    })),
  };
}

/** Doc 3/mockup: Purchasing is Manager+Owner only (same gate `supplier.routes.ts` already uses) — created here, not open to a cashier who has no reason to place orders. */
export async function createPurchaseOrder(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  body: CreatePurchaseOrderBody,
) {
  const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, locationId } });
  if (!supplier) throw notFound('Supplier not found.');
  if (supplier.archivedAt) throw conflict('Cannot order from an archived supplier.');

  await validateLines(prisma, locationId, body.lines);

  const totalCost = body.lines.reduce((sum, l) => sum.plus(lineTotalCedis(l.quantityOrdered, l.unitCost)), new Prisma.Decimal(0));
  const id = generateId();

  const po = await prisma.purchaseOrder.create({
    data: {
      id,
      locationId,
      supplierId: body.supplierId,
      expectedDate: body.expectedDate,
      totalCost,
      createdBy: userId,
      lines: {
        create: body.lines.map((l) => ({
          id: generateId(),
          variantId: l.variantId,
          quantityOrdered: l.quantityOrdered,
          unitCost: l.unitCost / 100,
        })),
      },
    },
    include: detailInclude,
  });

  return serializePurchaseOrder(po);
}

async function getRawPurchaseOrder(prisma: typeof PrismaClient, locationId: string, id: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id, locationId }, include: detailInclude });
  if (!po) throw notFound('Purchase order not found.');
  return po;
}

export async function getPurchaseOrder(prisma: typeof PrismaClient, locationId: string, id: string) {
  return serializePurchaseOrder(await getRawPurchaseOrder(prisma, locationId, id));
}

/** Only a DRAFT can be edited — once SENT, changing what was ordered without the supplier knowing isn't a real edit, it's a new order (Doc 3's own Draft/Pending/etc. status list treats these as one-way steps forward). */
export async function updatePurchaseOrder(
  prisma: typeof PrismaClient,
  locationId: string,
  id: string,
  body: UpdatePurchaseOrderBody,
) {
  const existing = await getRawPurchaseOrder(prisma, locationId, id);
  if (existing.status !== 'DRAFT') throw conflict('Only a draft purchase order can be edited.');

  const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, locationId } });
  if (!supplier) throw notFound('Supplier not found.');
  if (supplier.archivedAt) throw conflict('Cannot order from an archived supplier.');

  await validateLines(prisma, locationId, body.lines);
  const totalCost = body.lines.reduce((sum, l) => sum.plus(lineTotalCedis(l.quantityOrdered, l.unitCost)), new Prisma.Decimal(0));

  const po = await prisma.$transaction(async (tx) => {
    // Whole-line-set replace, not a per-line diff — matches the create
    // body's own "send the full set" shape, so the client never needs
    // to compute an add/remove/update diff against server state.
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: body.supplierId,
        expectedDate: body.expectedDate,
        totalCost,
        lines: {
          create: body.lines.map((l) => ({
            id: generateId(),
            variantId: l.variantId,
            quantityOrdered: l.quantityOrdered,
            unitCost: l.unitCost / 100,
          })),
        },
      },
      include: detailInclude,
    });
  });

  return serializePurchaseOrder(po);
}

export async function sendPurchaseOrder(prisma: typeof PrismaClient, locationId: string, id: string) {
  const existing = await getRawPurchaseOrder(prisma, locationId, id);
  if (existing.status !== 'DRAFT') throw conflict('Only a draft purchase order can be sent.');
  const po = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'SENT' }, include: detailInclude });
  return serializePurchaseOrder(po);
}

export async function cancelPurchaseOrder(prisma: typeof PrismaClient, locationId: string, id: string) {
  const existing = await getRawPurchaseOrder(prisma, locationId, id);
  if (existing.status !== 'DRAFT' && existing.status !== 'SENT') {
    throw conflict('Only a draft or pending purchase order can be cancelled.');
  }
  const po = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: detailInclude });
  return serializePurchaseOrder(po);
}

/**
 * Doc 6 T-28's receiving half. Reuses `receiveVariantLine()` — the exact
 * same moving-average cost recalculation, perishable batch creation, and
 * ledger write T-11's standalone receive endpoint uses — so a
 * PO-linked receipt and an ad-hoc one behave identically at the stock
 * level; the only PO-specific work here is stamping each line's
 * `quantityReceived` and rolling the order's own status up afterward.
 * "Cannot exceed what was ordered" mirrors T-19's own refund-quantity
 * guard, same reasoning: a line's remaining-receivable amount is
 * ordered minus already-received, checked before any write happens.
 */
export async function receivePurchaseOrder(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  id: string,
  body: ReceivePurchaseOrderBody,
) {
  const existing = await getRawPurchaseOrder(prisma, locationId, id);
  if (existing.status !== 'SENT' && existing.status !== 'PARTIAL') {
    throw conflict('Only a sent or partially received purchase order can receive stock.');
  }

  const lineById = new Map(existing.lines.map((l) => [l.id, l]));
  for (const req of body.lines) {
    const line = lineById.get(req.lineId);
    if (!line) throw notFound(`Purchase order line ${req.lineId} not found on this order.`);
    const remaining = line.quantityOrdered.minus(line.quantityReceived);
    if (new Prisma.Decimal(req.quantityReceived).greaterThan(remaining)) {
      throw conflict(`Cannot receive more than the ${remaining.toNumber()} units still outstanding on this line.`, {
        lineId: req.lineId,
        remaining: remaining.toNumber(),
      });
    }
  }

  const receivedAt = new Date();
  const po = await prisma.$transaction(async (tx) => {
    for (const req of body.lines) {
      const line = lineById.get(req.lineId)!;
      await receiveVariantLine(tx, locationId, {
        variantId: line.variantId,
        quantity: req.quantityReceived,
        unitCost: req.unitCost ?? toPesewas(line.unitCost),
        batchCode: req.batchCode,
        expiryDate: req.expiryDate,
        userId,
        referenceType: 'purchase_order',
        referenceId: id,
        occurredAt: receivedAt,
      });
      await tx.purchaseOrderLine.update({
        where: { id: req.lineId },
        data: { quantityReceived: { increment: req.quantityReceived } },
      });
    }

    const refreshedLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } });
    const allReceived = refreshedLines.every((l) => l.quantityReceived.greaterThanOrEqualTo(l.quantityOrdered));
    const anyReceived = refreshedLines.some((l) => l.quantityReceived.greaterThan(0));
    const status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : existing.status;

    return tx.purchaseOrder.update({ where: { id }, data: { status }, include: detailInclude });
  });

  return serializePurchaseOrder(po);
}

function buildPurchaseOrderWhere(locationId: string, query: ListPurchaseOrdersQuery): Prisma.PurchaseOrderWhereInput {
  const where: Prisma.PurchaseOrderWhereInput = { locationId };
  if (query.status) where.status = query.status;
  if (query.supplierId) where.supplierId = query.supplierId;
  const and: Prisma.PurchaseOrderWhereInput[] = [];
  if (query.dateFrom) and.push({ createdAt: { gte: query.dateFrom } });
  if (query.dateTo) and.push({ createdAt: { lte: query.dateTo } });
  if (and.length) where.AND = and;
  return where;
}

export async function listPurchaseOrders(prisma: typeof PrismaClient, locationId: string, query: ListPurchaseOrdersQuery) {
  const where = buildPurchaseOrderWhere(locationId, query);
  const [rows, totalCount] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: detailInclude,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return {
    items: rows.map(serializePurchaseOrder),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
  };
}

const STATS_WINDOW_DAYS = 30;

/** KPI tiles: Draft / Pending (SENT) / Partially Received / Received counts+totals, plus "Total Purchased This period" from the real ledger (same figure Reports shows, via the shared `getTotalPurchased`). */
export async function getPurchaseOrderStats(prisma: typeof PrismaClient, locationId: string, query: PurchaseOrderStatsQuery) {
  const dateTo = query.dateTo ?? new Date();
  const dateFrom = query.dateFrom ?? new Date(dateTo.getTime() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.purchaseOrder.findMany({ where: { locationId }, select: { status: true, totalCost: true } });

  const byStatus = {
    DRAFT: { orders: 0, total: new Prisma.Decimal(0) },
    SENT: { orders: 0, total: new Prisma.Decimal(0) },
    PARTIAL: { orders: 0, total: new Prisma.Decimal(0) },
    RECEIVED: { orders: 0, total: new Prisma.Decimal(0) },
  };
  for (const row of rows) {
    if (row.status === 'CANCELLED') continue; // not shown as a KPI tile
    const bucket = byStatus[row.status];
    bucket.orders++;
    bucket.total = bucket.total.plus(row.totalCost ?? 0);
  }

  const totalPurchased = await getTotalPurchased(prisma, locationId, dateFrom, dateTo);

  return {
    draft: { orders: byStatus.DRAFT.orders, total: toPesewas(byStatus.DRAFT.total) },
    pending: { orders: byStatus.SENT.orders, total: toPesewas(byStatus.SENT.total) },
    partiallyReceived: { orders: byStatus.PARTIAL.orders, total: toPesewas(byStatus.PARTIAL.total) },
    received: { orders: byStatus.RECEIVED.orders, total: toPesewas(byStatus.RECEIVED.total) },
    totalPurchased,
    periodFrom: dateFrom,
    periodTo: dateTo,
  };
}

/**
 * Doc 3/mockup "Restock recommendations": variants at or below their own
 * `reorderPoint` (Doc 6 T-28's low-stock trigger, already stored per
 * variant since T-06 — no new schema needed). `suggested` is the
 * variant's own `reorderQuantity` when set, `null` otherwise — never
 * fabricated, since there's no other real signal for "how much to
 * order" than what was actually configured on the variant.
 */
interface RestockRow {
  variant_id: string;
  sku: string;
  variant_name: string | null;
  product_name: string;
  quantity_on_hand: Prisma.Decimal;
  reorder_point: Prisma.Decimal;
  reorder_quantity: Prisma.Decimal | null;
  cost_price: Prisma.Decimal;
  supplier_id: string | null;
  supplier_name: string | null;
}

export async function getRestockRecommendations(prisma: typeof PrismaClient, locationId: string) {
  // `quantity_on_hand <= reorder_point` compares two columns on the same
  // row — not expressible through Prisma's fluent `where` builder (same
  // limitation T-07's search work already ran into), so this is raw SQL,
  // same as that fix. `cost_price` is included (Manager/Owner-only route,
  // same gate cost data always has) so the frontend can prefill a new
  // PO line's unit cost when turning a recommendation into an order,
  // without a second round-trip.
  const rows = await prisma.$queryRaw<RestockRow[]>(Prisma.sql`
    SELECT
      pv.id AS variant_id, pv.sku, pv.variant_name,
      p.name AS product_name,
      pv.quantity_on_hand, pv.reorder_point, pv.reorder_quantity, pv.cost_price,
      s.id AS supplier_id, s.name AS supplier_name
    FROM product_variant pv
    JOIN product p ON p.id = pv.product_id
    LEFT JOIN supplier s ON s.id = p.supplier_id
    WHERE pv.location_id = ${locationId}
      AND pv.archived_at IS NULL
      AND pv.reorder_point IS NOT NULL
      AND pv.quantity_on_hand <= pv.reorder_point
    ORDER BY pv.quantity_on_hand ASC
  `);

  return rows.map((r) => ({
    variantId: r.variant_id,
    sku: r.sku,
    productName: r.product_name,
    variantName: r.variant_name,
    quantityOnHand: r.quantity_on_hand.toNumber(),
    costPrice: toPesewas(r.cost_price),
    reorderPoint: r.reorder_point.toNumber(),
    suggestedQuantity: r.reorder_quantity?.toNumber() ?? null,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
  }));
}
