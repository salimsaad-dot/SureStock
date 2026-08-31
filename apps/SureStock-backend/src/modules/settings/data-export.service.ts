import { Prisma } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { toCsv } from '../../lib/csv.js';

function serializeValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Prisma.Decimal) return v.toString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Generic — reads column names off whatever the first row actually has, so adding a real column to a model shows up here for free instead of needing a second edit. */
function tableSection(name: string, rows: Record<string, unknown>[]): string[][] {
  if (rows.length === 0) return [[name], ['(no rows)'], []];
  const headers = Object.keys(rows[0]!);
  return [[name], headers, ...rows.map((r) => headers.map((h) => serializeValue(r[h]))), []];
}

/**
 * T-31: "full CSV export of every table" — narrowed, deliberately, to
 * this shop's own business data rather than a literal raw-table dump:
 * never `password_hash`/`pin_hash` (a curated `select` on `user`, not a
 * blanket `findMany`), and every table gets scoped to the caller's own
 * `locationId`.
 *
 * `category`/`supplier`/`tax_rate`/`product`/`purchase_order` now each
 * carry a real `locationId` (2026-08-25, the T-30 isolation follow-up) —
 * this used to join through this shop's own products to *infer* which
 * globally-shared rows it used, with an honest documented gap where a
 * category two different shops both happened to use would appear in
 * both exports. Scoping directly by `locationId` closes that for real.
 *
 * `review_queue_item` and `audit_log` have no `locationId` either, but
 * both always reference a `sale`/`variant`/`user` that does — scoped
 * through that relation instead.
 */
export async function exportAllData(prisma: typeof PrismaClient, locationId: string): Promise<string> {
  const [
    location,
    users,
    variants,
    categories,
    suppliers,
    taxRates,
    products,
    movements,
    batches,
    sales,
    saleLines,
    payments,
    tillShifts,
    purchaseOrders,
    poLines,
    stockTakes,
    stockTakeLines,
    reviewQueueItems,
    auditLogs,
  ] = await Promise.all([
    prisma.location.findMany({ where: { id: locationId } }),
    prisma.user.findMany({
      where: { locationId },
      select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    }),
    prisma.productVariant.findMany({ where: { locationId } }),
    prisma.category.findMany({ where: { locationId } }),
    prisma.supplier.findMany({ where: { locationId } }),
    prisma.taxRate.findMany({ where: { locationId } }),
    prisma.product.findMany({ where: { locationId } }),
    prisma.stockMovement.findMany({ where: { variant: { locationId } } }),
    prisma.batch.findMany({ where: { variant: { locationId } } }),
    prisma.sale.findMany({ where: { locationId } }),
    prisma.saleLine.findMany({ where: { sale: { locationId } } }),
    prisma.payment.findMany({ where: { sale: { locationId } } }),
    prisma.tillShift.findMany({ where: { user: { locationId } } }),
    prisma.purchaseOrder.findMany({ where: { locationId } }),
    prisma.purchaseOrderLine.findMany({ where: { variant: { locationId } } }),
    prisma.stockTake.findMany({ where: { locationId } }),
    prisma.stockTakeLine.findMany({ where: { stockTake: { locationId } } }),
    prisma.reviewQueueItem.findMany({ where: { OR: [{ sale: { locationId } }, { variant: { locationId } }] } }),
    prisma.auditLog.findMany({ where: { user: { locationId } } }),
  ]);

  const rows: string[][] = [
    ['SureStock Data Export'],
    ['Location', location[0]?.name ?? locationId],
    ['Generated', new Date().toISOString()],
    [],
    ...tableSection('location', location),
    ...tableSection('users', users),
    ...tableSection('categories', categories),
    ...tableSection('suppliers', suppliers),
    ...tableSection('tax_rates', taxRates),
    ...tableSection('products', products),
    ...tableSection('product_variants', variants),
    ...tableSection('stock_movements', movements),
    ...tableSection('batches', batches),
    ...tableSection('sales', sales),
    ...tableSection('sale_lines', saleLines),
    ...tableSection('payments', payments),
    ...tableSection('till_shifts', tillShifts),
    ...tableSection('purchase_orders', purchaseOrders),
    ...tableSection('purchase_order_lines', poLines),
    ...tableSection('stock_takes', stockTakes),
    ...tableSection('stock_take_lines', stockTakeLines),
    ...tableSection('review_queue_items', reviewQueueItems),
    ...tableSection('audit_log', auditLogs),
  ];

  return toCsv(rows);
}
