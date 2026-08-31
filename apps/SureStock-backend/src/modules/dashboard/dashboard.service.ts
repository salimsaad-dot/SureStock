import { Prisma } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { toPesewas } from '../../lib/money.js';
import { aggregatePeriod, getInventorySnapshot, getReportsProducts, getReportsTrend, pctChange } from '../reports/reports.service.js';

function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setUTCHours(23, 59, 59, 999);
  return e;
}

/**
 * Doc 6 T-20 / till-shift.service.ts's own `closeTillShift()` formula,
 * computed live for a shift that hasn't closed yet instead of waiting
 * for it to: opening float plus every CASH/CHANGE payment tied to the
 * shift's sales so far. Summed across every currently-open shift at the
 * location — nothing in this schema stops two cashiers running separate
 * tills at once, so "cash in drawer" means the honest total, not just
 * whichever shift happens to belong to the viewer.
 */
async function getCashInDrawer(prisma: typeof PrismaClient, locationId: string): Promise<number> {
  const openShifts = await prisma.tillShift.findMany({
    where: { closedAt: null, user: { locationId } },
    select: { id: true, openingFloat: true },
  });
  if (openShifts.length === 0) return 0;

  const cashTotal = await prisma.payment.aggregate({
    where: { method: { in: ['CASH', 'CHANGE'] }, status: 'CONFIRMED', sale: { tillShiftId: { in: openShifts.map((s) => s.id) } } },
    _sum: { amount: true },
  });
  const floatTotal = openShifts.reduce((sum, s) => sum.plus(s.openingFloat), new Prisma.Decimal(0));
  return toPesewas(floatTotal.plus(cashTotal._sum.amount ?? new Prisma.Decimal(0)));
}

export interface AttentionItem {
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'TILL_VARIANCE' | 'REVIEW_QUEUE';
  label: string;
  count: number;
  linkPath: string;
}

/**
 * Doc 3 §6: "an attention list (low stock, expiring soon, till
 * variances, failed syncs)... every card links straight into the screen
 * that acts on it." Two of the prototype's four literal items map onto
 * real, already-built surfaces exactly (low/out-of-stock from the same
 * inventory snapshot Reports uses; a shift closed today past the
 * location's own variance threshold, Doc 6 T-29). The other two get an
 * honest substitution rather than a literal-but-fake match: "expiring
 * soon" has no expiry-date field anywhere on `Batch`/`ProductVariant" in
 * this schema to query (deliberately not fabricated); "failed syncs" is
 * client-only outbox state (the Dexie queue), which no backend endpoint
 * can see — the open Review Queue count (T-23) is the real, server-side
 * equivalent of "something from an offline sync needs a decision."
 */
async function getAttentionItems(prisma: typeof PrismaClient, locationId: string, today: Date): Promise<AttentionItem[]> {
  const [inventory, location, openReviewCount] = await Promise.all([
    getInventorySnapshot(prisma, locationId),
    prisma.location.findUniqueOrThrow({ where: { id: locationId }, select: { tillVarianceThreshold: true } }),
    prisma.reviewQueueItem.count({ where: { resolvedAt: null } }),
  ]);

  const shiftsToday = await prisma.tillShift.findMany({
    where: { closedAt: { gte: startOfDay(today), lte: endOfDay(today) }, variance: { not: null }, user: { locationId } },
    select: { variance: true },
  });
  const varianceCount = shiftsToday.filter((s) => s.variance!.abs().greaterThan(location.tillVarianceThreshold)).length;

  const items: AttentionItem[] = [];
  if (inventory.outOfStockCount > 0) {
    items.push({ type: 'OUT_OF_STOCK', label: `${inventory.outOfStockCount} product${inventory.outOfStockCount === 1 ? '' : 's'} out of stock`, count: inventory.outOfStockCount, linkPath: '/inventory?stockLevel=OUT' });
  }
  if (inventory.lowStockCount > 0) {
    items.push({ type: 'LOW_STOCK', label: `${inventory.lowStockCount} product${inventory.lowStockCount === 1 ? '' : 's'} below reorder point`, count: inventory.lowStockCount, linkPath: '/inventory?stockLevel=LOW' });
  }
  if (varianceCount > 0) {
    items.push({ type: 'TILL_VARIANCE', label: `${varianceCount} till shift${varianceCount === 1 ? '' : 's'} closed with a real variance today`, count: varianceCount, linkPath: '/sales' });
  }
  if (openReviewCount > 0) {
    items.push({ type: 'REVIEW_QUEUE', label: `${openReviewCount} item${openReviewCount === 1 ? '' : 's'} waiting for review`, count: openReviewCount, linkPath: '/review-queue' });
  }
  return items;
}

/**
 * Doc 3 §6 / T-25: "the owner lands on a dashboard, not the till...
 * today's revenue, transactions, gross profit, and cash in drawer, each
 * with a comparison to the same day last week... a 30-day revenue
 * chart, an attention list... and today's top sellers." Computed live,
 * same "no rollup job" decision already made for Reports (T-24) — a
 * single day's aggregate is cheap, and T-25's own "loads in under two
 * seconds" criterion doesn't need a precomputed table to hit.
 */
export async function getDashboard(prisma: typeof PrismaClient, locationId: string) {
  const now = new Date();
  const todayFrom = startOfDay(now);
  const todayTo = endOfDay(now);
  const lastWeekFrom = startOfDay(new Date(now.getTime() - 7 * 86_400_000));
  const lastWeekTo = endOfDay(new Date(now.getTime() - 7 * 86_400_000));
  const trendFrom = startOfDay(new Date(now.getTime() - 29 * 86_400_000));

  const [today, lastWeek, cashInDrawer, trend, attention, topSellers] = await Promise.all([
    aggregatePeriod(prisma, locationId, { dateFrom: todayFrom, dateTo: todayTo }, todayFrom, todayTo),
    aggregatePeriod(prisma, locationId, { dateFrom: lastWeekFrom, dateTo: lastWeekTo }, lastWeekFrom, lastWeekTo),
    getCashInDrawer(prisma, locationId),
    getReportsTrend(prisma, locationId, { dateFrom: trendFrom, dateTo: todayTo }),
    getAttentionItems(prisma, locationId, now),
    getReportsProducts(prisma, locationId, { dateFrom: todayFrom, dateTo: todayTo, direction: 'top', limit: 5 }),
  ]);

  const todayRevenue = toPesewas(today.grossSales.minus(today.refundTotal));
  const lastWeekRevenue = toPesewas(lastWeek.grossSales.minus(lastWeek.refundTotal));
  const todayGrossProfit = toPesewas(today.grossProfit);
  const lastWeekGrossProfit = toPesewas(lastWeek.grossProfit);

  return {
    todayRevenue,
    todayRevenueChangePct: pctChange(todayRevenue, lastWeekRevenue),
    todayTransactions: today.transactionCount,
    todayTransactionsChangePct: pctChange(today.transactionCount, lastWeek.transactionCount),
    todayGrossProfit,
    todayGrossProfitChangePct: pctChange(todayGrossProfit, lastWeekGrossProfit),
    cashInDrawer,
    trend,
    attention,
    topSellers,
  };
}
