import { Prisma } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { toPesewas } from '../../lib/money.js';
import { toCsv } from '../../lib/csv.js';
import type { ReportsFilter, ReportsProductsQuery, ShrinkageQuery, StaffActivityQuery } from './reports.schemas.js';

function buildSaleWhere(locationId: string, filter: ReportsFilter, dateFrom: Date, dateTo: Date): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = { locationId, soldAt: { gte: dateFrom, lte: dateTo } };
  if (filter.userId) where.userId = filter.userId;
  if (filter.method) where.payments = { some: { method: filter.method } };
  return where;
}

interface PeriodAggregate {
  grossSales: Prisma.Decimal;
  transactionCount: number;
  refundTotal: Prisma.Decimal;
  grossProfit: Prisma.Decimal;
}

/**
 * "Transactions" here means completed sales only (`refundOfSaleId`
 * null) — a refund isn't a new order, it gets its own dollar-figure
 * card instead of inflating the count, unlike the Sales screen's KPI
 * cards, which count every row (sale or refund) as one "transaction."
 * `grossProfit` nets over *every* row including refunds, since a
 * refunded sale's cost basis really did come back too.
 */
export async function aggregatePeriod(
  prisma: typeof PrismaClient,
  locationId: string,
  filter: ReportsFilter,
  dateFrom: Date,
  dateTo: Date,
): Promise<PeriodAggregate> {
  const rows = await prisma.sale.findMany({
    where: buildSaleWhere(locationId, filter, dateFrom, dateTo),
    select: { total: true, costTotal: true, refundOfSaleId: true },
  });

  let grossSales = new Prisma.Decimal(0);
  let transactionCount = 0;
  let refundTotal = new Prisma.Decimal(0);
  let grossProfit = new Prisma.Decimal(0);

  for (const row of rows) {
    grossProfit = grossProfit.plus(row.total).minus(row.costTotal);
    if (row.refundOfSaleId) {
      refundTotal = refundTotal.plus(row.total.abs());
    } else {
      grossSales = grossSales.plus(row.total);
      transactionCount++;
    }
  }

  return { grossSales, transactionCount, refundTotal, grossProfit };
}

/** `null` (not 0 or Infinity) when the prior period had nothing to compare against — an honest "can't say," not a fabricated percentage. */
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / prior) * 100;
}

/**
 * A product is bucketed by its worst variant — same rule as the
 * frontend's own `productStockLevel()` (Inventory page), so the two
 * screens' counts never quietly disagree. Unlike that hook, this is a
 * real server-side aggregate rather than the frontend walking every
 * page of `GET /products` itself — the "no aggregate-count endpoint
 * yet" caveat from the Inventory redesign, closed here at least for
 * Reports (worth pointing `useInventoryStats` at this too later).
 */
export async function getInventorySnapshot(prisma: typeof PrismaClient, locationId: string) {
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE', variants: { some: { locationId, archivedAt: null } } },
    select: { variants: { where: { locationId, archivedAt: null }, select: { quantityOnHand: true, reorderPoint: true, costPrice: true } } },
  });

  let outOfStockCount = 0;
  let lowStockCount = 0;
  let inventoryValue = new Prisma.Decimal(0);

  for (const product of products) {
    let worst: 'IN_STOCK' | 'LOW' | 'OUT' = 'IN_STOCK';
    for (const v of product.variants) {
      inventoryValue = inventoryValue.plus(v.quantityOnHand.times(v.costPrice));
      if (v.quantityOnHand.lessThanOrEqualTo(0)) worst = 'OUT';
      else if (worst !== 'OUT' && v.reorderPoint !== null && v.quantityOnHand.lessThanOrEqualTo(v.reorderPoint)) worst = 'LOW';
    }
    if (worst === 'OUT') outOfStockCount++;
    else if (worst === 'LOW') lowStockCount++;
  }

  return {
    totalProductCount: products.length,
    outOfStockCount,
    lowStockCount,
    inventoryValue: toPesewas(inventoryValue),
  };
}

/** Read from the ledger's own `PURCHASE_RECEIVED` movements — also reused by the Purchasing module's own stats (both want the same "money actually spent on stock" figure, computed the same way). */
export async function getTotalPurchased(prisma: typeof PrismaClient, locationId: string, dateFrom: Date, dateTo: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>(Prisma.sql`
    SELECT SUM(sm.quantity_delta * sm.unit_cost) AS total
    FROM stock_movement sm
    JOIN product_variant pv ON pv.id = sm.variant_id
    WHERE pv.location_id = ${locationId} AND sm.reason = 'PURCHASE_RECEIVED' AND sm.occurred_at BETWEEN ${dateFrom} AND ${dateTo}
  `);
  return toPesewas(rows[0]?.total ?? new Prisma.Decimal(0));
}

export async function getReportsOverview(prisma: typeof PrismaClient, locationId: string, filter: ReportsFilter) {
  const durationMs = filter.dateTo.getTime() - filter.dateFrom.getTime();
  const priorDateTo = new Date(filter.dateFrom.getTime() - 1);
  const priorDateFrom = new Date(priorDateTo.getTime() - durationMs);

  const [current, prior, inventory, totalPurchased] = await Promise.all([
    aggregatePeriod(prisma, locationId, filter, filter.dateFrom, filter.dateTo),
    aggregatePeriod(prisma, locationId, filter, priorDateFrom, priorDateTo),
    getInventorySnapshot(prisma, locationId),
    getTotalPurchased(prisma, locationId, filter.dateFrom, filter.dateTo),
  ]);

  const totalSales = toPesewas(current.grossSales.minus(current.refundTotal));
  const priorTotalSales = toPesewas(prior.grossSales.minus(prior.refundTotal));
  const avgOrderValue = toPesewas(current.transactionCount > 0 ? current.grossSales.dividedBy(current.transactionCount) : new Prisma.Decimal(0));
  const priorAvgOrderValue = toPesewas(prior.transactionCount > 0 ? prior.grossSales.dividedBy(prior.transactionCount) : new Prisma.Decimal(0));
  const grossProfit = toPesewas(current.grossProfit);
  const priorGrossProfit = toPesewas(prior.grossProfit);
  const refundTotal = toPesewas(current.refundTotal);
  const priorRefundTotal = toPesewas(prior.refundTotal);

  return {
    totalSales,
    totalSalesChangePct: pctChange(totalSales, priorTotalSales),
    grossProfit,
    grossProfitChangePct: pctChange(grossProfit, priorGrossProfit),
    transactionCount: current.transactionCount,
    transactionCountChangePct: pctChange(current.transactionCount, prior.transactionCount),
    avgOrderValue,
    avgOrderValueChangePct: pctChange(avgOrderValue, priorAvgOrderValue),
    refundTotal,
    refundTotalChangePct: pctChange(refundTotal, priorRefundTotal),
    ...inventory,
    totalPurchased,
  };
}

export async function getReportsTrend(prisma: typeof PrismaClient, locationId: string, filter: ReportsFilter) {
  const rows = await prisma.sale.findMany({
    where: buildSaleWhere(locationId, filter, filter.dateFrom, filter.dateTo),
    select: { total: true, soldAt: true },
  });

  const dailyMap = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    const day = row.soldAt.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? new Prisma.Decimal(0)).plus(row.total));
  }

  const trend: { date: string; totalSales: number }[] = [];
  for (const d = new Date(filter.dateFrom); d <= filter.dateTo; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    trend.push({ date: day, totalSales: toPesewas(dailyMap.get(day) ?? new Prisma.Decimal(0)) });
  }
  return trend;
}

/**
 * `CHANGE` is never its own bucket — it's cash handed back on
 * overpayment, so it nets into the same CASH bucket it came out of
 * (the same convention till-shift.service.ts uses when computing
 * expected cash at close: "both have to count toward the cash
 * drawer"), not a distinct tender a customer chose. Refund payment
 * rows (negative amounts) net naturally into whichever method they
 * were refunded through.
 */
export async function getPaymentBreakdown(prisma: typeof PrismaClient, locationId: string, filter: ReportsFilter) {
  const rows = await prisma.payment.findMany({
    where: { status: 'CONFIRMED', sale: buildSaleWhere(locationId, filter, filter.dateFrom, filter.dateTo) },
    select: { method: true, amount: true },
  });

  const totals = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    const bucket = row.method === 'CHANGE' ? 'CASH' : row.method;
    totals.set(bucket, (totals.get(bucket) ?? new Prisma.Decimal(0)).plus(row.amount));
  }
  return [...totals.entries()].map(([method, total]) => ({ method, total: toPesewas(total) }));
}

interface ProductRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  qty_sold: number | string;
  revenue: Prisma.Decimal;
}

/**
 * One query, sort direction flipped, for both "Top selling products"
 * and "Low/slow moving products" — they're the same ranking, not two
 * different concepts. Scoped to real sale lines only (never refund
 * lines — a return isn't a customer buying something) and to products
 * that have actually sold at least once in range, so "low movers"
 * means genuinely slow, not simply never-stocked.
 */
export async function getReportsProducts(prisma: typeof PrismaClient, locationId: string, query: ReportsProductsQuery) {
  const rows = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
    SELECT pv.id AS variant_id, pv.product_id, p.name AS product_name, pv.sku,
           SUM(sl.quantity) AS qty_sold, SUM(sl.line_total) AS revenue
    FROM sale_line sl
    JOIN sale s ON s.id = sl.sale_id
    JOIN product_variant pv ON pv.id = sl.variant_id
    JOIN product p ON p.id = pv.product_id
    WHERE s.location_id = ${locationId} AND s.refund_of_sale_id IS NULL
      AND s.sold_at BETWEEN ${query.dateFrom} AND ${query.dateTo}
      ${query.userId ? Prisma.sql`AND s.user_id = ${query.userId}` : Prisma.empty}
      ${query.categoryId ? Prisma.sql`AND p.category_id = ${query.categoryId}` : Prisma.empty}
    GROUP BY pv.id, pv.product_id, p.name, pv.sku
    HAVING SUM(sl.quantity) > 0
    ORDER BY qty_sold ${query.direction === 'top' ? Prisma.sql`DESC` : Prisma.sql`ASC`}
    LIMIT ${query.limit}
  `);

  return rows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    qtySold: Number(r.qty_sold),
    revenue: toPesewas(r.revenue),
  }));
}

interface ShrinkageRow {
  user_id: string;
  user_name: string;
  bucket: 'DAMAGE' | 'EXPIRY' | 'UNEXPLAINED_VARIANCE';
  loss_value: Prisma.Decimal;
}

const SHRINKAGE_TYPES = ['DAMAGE', 'EXPIRY', 'UNEXPLAINED_VARIANCE'] as const;
export type ShrinkageType = (typeof SHRINKAGE_TYPES)[number];

/**
 * Doc 1 §3.4: "Losses to damage, expiry, and unexplained variance, by
 * period and by staff." "Unexplained variance" means a stock take
 * finding *less* stock than the ledger expects (a negative
 * `STOCK_TAKE_ADJUSTMENT`) — not till cash variance, which Doc 1 lists
 * under Staff activity's own metrics below, a distinct report from this
 * one. Valued at each movement's own recorded `unit_cost` when present,
 * falling back to the variant's *current* `cost_price` for any older row
 * from before this movement type ever captured one (see the 2026-08-24
 * fix in `adjustment.service.ts`/`stock-take.service.ts` — before that,
 * every DAMAGE/EXPIRY/STOCK_TAKE_ADJUSTMENT row had a null `unit_cost`).
 */
export async function getShrinkageReport(prisma: typeof PrismaClient, locationId: string, filter: ShrinkageQuery) {
  const rows = await prisma.$queryRaw<ShrinkageRow[]>(Prisma.sql`
    SELECT sm.user_id, u.name AS user_name,
      CASE WHEN sm.reason = 'STOCK_TAKE_ADJUSTMENT' THEN 'UNEXPLAINED_VARIANCE' ELSE sm.reason END AS bucket,
      SUM(ABS(sm.quantity_delta) * COALESCE(sm.unit_cost, pv.cost_price)) AS loss_value
    FROM stock_movement sm
    JOIN product_variant pv ON pv.id = sm.variant_id
    JOIN user u ON u.id = sm.user_id
    WHERE pv.location_id = ${locationId}
      AND sm.occurred_at BETWEEN ${filter.dateFrom} AND ${filter.dateTo}
      AND (sm.reason IN ('DAMAGE', 'EXPIRY') OR (sm.reason = 'STOCK_TAKE_ADJUSTMENT' AND sm.quantity_delta < 0))
      ${filter.userId ? Prisma.sql`AND sm.user_id = ${filter.userId}` : Prisma.empty}
    GROUP BY sm.user_id, u.name, bucket
  `);

  const byTypeTotals: Record<ShrinkageType, number> = { DAMAGE: 0, EXPIRY: 0, UNEXPLAINED_VARIANCE: 0 };
  const byStaffMap = new Map<string, { userId: string; userName: string; damageTotal: number; expiryTotal: number; varianceTotal: number }>();

  for (const row of rows) {
    const value = toPesewas(row.loss_value);
    byTypeTotals[row.bucket] += value;

    const staff = byStaffMap.get(row.user_id) ?? { userId: row.user_id, userName: row.user_name, damageTotal: 0, expiryTotal: 0, varianceTotal: 0 };
    if (row.bucket === 'DAMAGE') staff.damageTotal += value;
    else if (row.bucket === 'EXPIRY') staff.expiryTotal += value;
    else staff.varianceTotal += value;
    byStaffMap.set(row.user_id, staff);
  }

  const byStaff = [...byStaffMap.values()]
    .map((s) => ({ ...s, total: s.damageTotal + s.expiryTotal + s.varianceTotal }))
    .sort((a, b) => b.total - a.total);
  const byType = SHRINKAGE_TYPES.map((type) => ({ type, total: byTypeTotals[type] }));

  return { totalLoss: byType.reduce((sum, t) => sum + t.total, 0), byType, byStaff };
}

interface StaffActivityRow {
  user_id: string;
  user_name: string;
  role: string;
  sales_count: number | string;
  sales_total: Prisma.Decimal;
  discounts_total: Prisma.Decimal;
  refunds_count: number | string;
  refunds_total: Prisma.Decimal;
}

interface StaffShiftRow {
  user_id: string;
  user_name: string;
  role: string;
  shift_count: number | string;
  total_variance: Prisma.Decimal | null;
}

/**
 * Doc 1 §3.4: "Sales per cashier, discounts given, refunds processed,
 * till variances." One row per staff member who had any sale, refund,
 * or till shift in range — same "only show what actually happened"
 * pattern as the Top/Low products tables below, not a full roster
 * padded with zero rows for staff who didn't work this period.
 * "Refunds processed" means the staff member who *processed* the
 * refund (the refund sale's own `userId`), which can differ from
 * whoever rang up the original sale — that's the real, auditable fact
 * this metric is for.
 */
export async function getStaffActivity(prisma: typeof PrismaClient, locationId: string, filter: StaffActivityQuery) {
  const methodFilter = filter.method
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM payment p WHERE p.sale_id = s.id AND p.method = ${filter.method})`
    : Prisma.empty;

  const [salesRows, shiftRows] = await Promise.all([
    prisma.$queryRaw<StaffActivityRow[]>(Prisma.sql`
      SELECT s.user_id, u.name AS user_name, u.role,
        SUM(CASE WHEN s.refund_of_sale_id IS NULL THEN 1 ELSE 0 END) AS sales_count,
        SUM(CASE WHEN s.refund_of_sale_id IS NULL THEN s.total ELSE 0 END) AS sales_total,
        SUM(CASE WHEN s.refund_of_sale_id IS NULL THEN s.discount_total ELSE 0 END) AS discounts_total,
        SUM(CASE WHEN s.refund_of_sale_id IS NOT NULL THEN 1 ELSE 0 END) AS refunds_count,
        SUM(CASE WHEN s.refund_of_sale_id IS NOT NULL THEN ABS(s.total) ELSE 0 END) AS refunds_total
      FROM sale s
      JOIN user u ON u.id = s.user_id
      WHERE s.location_id = ${locationId} AND s.sold_at BETWEEN ${filter.dateFrom} AND ${filter.dateTo}
        ${filter.userId ? Prisma.sql`AND s.user_id = ${filter.userId}` : Prisma.empty}
        ${methodFilter}
      GROUP BY s.user_id, u.name, u.role
    `),
    prisma.$queryRaw<StaffShiftRow[]>(Prisma.sql`
      SELECT ts.user_id, u.name AS user_name, u.role,
        COUNT(*) AS shift_count,
        SUM(ts.variance) AS total_variance
      FROM till_shift ts
      JOIN user u ON u.id = ts.user_id
      WHERE u.location_id = ${locationId} AND ts.closed_at BETWEEN ${filter.dateFrom} AND ${filter.dateTo}
        ${filter.userId ? Prisma.sql`AND ts.user_id = ${filter.userId}` : Prisma.empty}
      GROUP BY ts.user_id, u.name, u.role
    `),
  ]);

  interface Row {
    userId: string;
    userName: string;
    role: string;
    salesCount: number;
    salesTotal: number;
    discountsTotal: number;
    refundsCount: number;
    refundsTotal: number;
    shiftCount: number;
    totalVariance: number;
  }

  const rowsByUser = new Map<string, Row>();
  for (const r of salesRows) {
    rowsByUser.set(r.user_id, {
      userId: r.user_id,
      userName: r.user_name,
      role: r.role,
      salesCount: Number(r.sales_count),
      salesTotal: toPesewas(r.sales_total),
      discountsTotal: toPesewas(r.discounts_total),
      refundsCount: Number(r.refunds_count),
      refundsTotal: toPesewas(r.refunds_total),
      shiftCount: 0,
      totalVariance: 0,
    });
  }
  for (const r of shiftRows) {
    const shiftCount = Number(r.shift_count);
    const totalVariance = toPesewas(r.total_variance ?? new Prisma.Decimal(0));
    const existing = rowsByUser.get(r.user_id);
    if (existing) {
      existing.shiftCount = shiftCount;
      existing.totalVariance = totalVariance;
    } else {
      rowsByUser.set(r.user_id, {
        userId: r.user_id,
        userName: r.user_name,
        role: r.role,
        salesCount: 0,
        salesTotal: 0,
        discountsTotal: 0,
        refundsCount: 0,
        refundsTotal: 0,
        shiftCount,
        totalVariance,
      });
    }
  }

  return [...rowsByUser.values()].sort((a, b) => b.salesTotal - a.salesTotal);
}

/** Doc 3 App Flow §5-style "Export report," extended to Reports — one CSV, every section, matching the single button in the mockup rather than a control per chart/table. */
export async function exportReportsCsv(prisma: typeof PrismaClient, locationId: string, filter: ReportsFilter) {
  const [overview, trend, paymentBreakdown, topProducts, lowProducts, shrinkage, staffActivity] = await Promise.all([
    getReportsOverview(prisma, locationId, filter),
    getReportsTrend(prisma, locationId, filter),
    getPaymentBreakdown(prisma, locationId, filter),
    getReportsProducts(prisma, locationId, { ...filter, direction: 'top', limit: 10 }),
    getReportsProducts(prisma, locationId, { ...filter, direction: 'low', limit: 10 }),
    getShrinkageReport(prisma, locationId, filter),
    getStaffActivity(prisma, locationId, filter),
  ]);

  const cedis = (pesewas: number) => (pesewas / 100).toFixed(2);
  const rows: string[][] = [
    ['SureStock Report', `${filter.dateFrom.toISOString().slice(0, 10)} to ${filter.dateTo.toISOString().slice(0, 10)}`],
    [],
    ['Summary'],
    ['Metric', 'Value'],
    ['Total Sales (GH₵)', cedis(overview.totalSales)],
    ['Gross Profit (GH₵)', cedis(overview.grossProfit)],
    ['Transactions', String(overview.transactionCount)],
    ['Average Order Value (GH₵)', cedis(overview.avgOrderValue)],
    ['Refunds (GH₵)', cedis(overview.refundTotal)],
    ['Out of Stock Products', String(overview.outOfStockCount)],
    ['Low Stock Products', String(overview.lowStockCount)],
    ['Total Products', String(overview.totalProductCount)],
    ['Inventory Value (GH₵)', cedis(overview.inventoryValue)],
    ['Total Purchased (GH₵)', cedis(overview.totalPurchased)],
    [],
    ['Sales Over Time'],
    ['Date', 'Total Sales (GH₵)'],
    ...trend.map((t) => [t.date, cedis(t.totalSales)]),
    [],
    ['Sales By Payment Method'],
    ['Method', 'Total (GH₵)'],
    ...paymentBreakdown.map((p) => [p.method, cedis(p.total)]),
    [],
    ['Top Selling Products'],
    ['Product', 'SKU', 'Qty Sold', 'Revenue (GH₵)'],
    ...topProducts.map((p) => [p.productName, p.sku, String(p.qtySold), cedis(p.revenue)]),
    [],
    ['Low / Slow Moving Products'],
    ['Product', 'SKU', 'Qty Sold', 'Revenue (GH₵)'],
    ...lowProducts.map((p) => [p.productName, p.sku, String(p.qtySold), cedis(p.revenue)]),
    [],
    ['Shrinkage'],
    ['Type', 'Loss (GH₵)'],
    ...shrinkage.byType.map((t) => [t.type, cedis(t.total)]),
    [],
    ['Shrinkage By Staff'],
    ['Staff', 'Damage (GH₵)', 'Expiry (GH₵)', 'Unexplained Variance (GH₵)', 'Total (GH₵)'],
    ...shrinkage.byStaff.map((s) => [s.userName, cedis(s.damageTotal), cedis(s.expiryTotal), cedis(s.varianceTotal), cedis(s.total)]),
    [],
    ['Staff Activity'],
    ['Staff', 'Role', 'Sales Count', 'Sales Total (GH₵)', 'Discounts Given (GH₵)', 'Refunds Processed', 'Refunds Total (GH₵)', 'Till Shifts', 'Till Variance (GH₵)'],
    ...staffActivity.map((s) => [
      s.userName,
      s.role,
      String(s.salesCount),
      cedis(s.salesTotal),
      cedis(s.discountsTotal),
      String(s.refundsCount),
      cedis(s.refundsTotal),
      String(s.shiftCount),
      cedis(s.totalVariance),
    ]),
  ];

  return toCsv(rows);
}
