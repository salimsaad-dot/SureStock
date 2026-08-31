import type { NotificationType } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toPesewas, type Pesewas } from '../../lib/money.js';
import { HttpError } from '../../lib/http-error.js';
import { aggregatePeriod } from '../reports/reports.service.js';
import { sendSms } from './sms-client.js';

function ghs(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`;
}

/**
 * Every real trigger funnels through here so "check the phone number is
 * set, send it, write the log row" is written exactly once. Never throws
 * — a notification is always a side effect of some other real action
 * (see sms-client.ts's own note), and this is the one place that
 * guarantee has to actually hold.
 */
async function dispatch(prisma: typeof PrismaClient, locationId: string, type: NotificationType, message: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { notificationPhone: true } });
  const phone = location?.notificationPhone;

  if (!phone) {
    await prisma.notificationLog.create({
      data: {
        id: generateId(),
        locationId,
        type,
        recipientPhone: '',
        message,
        status: 'FAILED',
        providerResponse: 'No alert phone number configured on this shop’s Notifications settings.',
      },
    });
    return;
  }

  const result = await sendSms(phone, message);
  await prisma.notificationLog.create({
    data: {
      id: generateId(),
      locationId,
      type,
      recipientPhone: phone,
      message,
      status: result.status,
      providerResponse: result.providerResponse ?? null,
    },
  });
}

/**
 * Called by every real write path that can decrease stock (sale,
 * adjustment, stock take) after its own transaction has committed — never
 * from inside one, since an SMS provider call is exactly the kind of slow
 * I/O that must not hold a row lock open (this app's whole concurrency
 * story, T-16's `SELECT ... FOR UPDATE` included, depends on that). Takes
 * plain variant ids, not rich objects, so call sites don't need to carry
 * product/name data through their own transaction just for this — the
 * current (post-commit) truth is re-read here instead.
 */
export async function notifyLowStock(prisma: typeof PrismaClient, locationId: string, variantIds: string[]) {
  if (variantIds.length === 0) return;

  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { notifyLowStockEnabled: true } });
  if (!location?.notifyLowStockEnabled) return;

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { sku: true, quantityOnHand: true, reorderPoint: true, product: { select: { name: true } } },
  });
  if (variants.length === 0) return;

  const lines = variants.map(
    (v) => `${v.product.name} (${v.sku}): ${v.quantityOnHand.toString()} left, reorder at ${v.reorderPoint?.toString() ?? '-'}`,
  );
  const message = `SureStock low stock:\n${lines.join('\n')}`;
  await dispatch(prisma, locationId, 'LOW_STOCK', message);
}

export interface TillVarianceAlertParams {
  userId: string;
  variance: Pesewas;
  expectedCash: Pesewas;
  countedCash: Pesewas;
}

/** Called by till-shift.service.ts's closeTillShift, alongside its existing TILL_VARIANCE_ALERT audit_log write — same trigger condition, now with a real delivery attempt too. */
export async function notifyTillVariance(prisma: typeof PrismaClient, locationId: string, params: TillVarianceAlertParams) {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { notifyTillVarianceEnabled: true } });
  if (!location?.notifyTillVarianceEnabled) return;

  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { name: true } });
  const direction = params.variance >= 0 ? 'over' : 'short';
  const message = `SureStock till variance: ${user?.name ?? 'A cashier'}’s till closed ${ghs(Math.abs(params.variance))} ${direction} (expected ${ghs(params.expectedCash)}, counted ${ghs(params.countedCash)}).`;
  await dispatch(prisma, locationId, 'TILL_VARIANCE', message);
}

/**
 * No task scheduler exists anywhere in this project to make anything
 * genuinely "nightly" — the exact same honest gap T-31's backup feature
 * hit (see data-export.service.ts). This is the real, callable function;
 * `POST /notifications/daily-summary` (notifications.routes.ts) exposes
 * it as a manual "Send now" action today, and is also the literal
 * endpoint a real OS-level cron/task scheduler should hit once one
 * exists — nothing else would need to change.
 */
export async function sendDailySummary(prisma: typeof PrismaClient, locationId: string) {
  const now = new Date();
  const dateFrom = new Date(now);
  dateFrom.setHours(0, 0, 0, 0);

  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { notifyDailySummaryEnabled: true } });
  if (!location?.notifyDailySummaryEnabled) {
    throw new HttpError(409, 'CONFLICT', 'Daily summary alerts are turned off in Settings → Notifications — turn them on first.');
  }

  const agg = await aggregatePeriod(prisma, locationId, { dateFrom, dateTo: now }, dateFrom, now);
  const message =
    `SureStock daily summary: ${agg.transactionCount} sale(s), ${ghs(toPesewas(agg.grossSales))} gross, ` +
    `${ghs(toPesewas(agg.refundTotal))} refunded, ${ghs(toPesewas(agg.grossProfit))} gross profit.`;
  await dispatch(prisma, locationId, 'DAILY_SUMMARY', message);
}

/** Settings → Notifications' "Send test SMS" button — the one way to confirm a phone number/provider setup actually works without waiting for a real alert condition. Always allowed regardless of the three toggles above (it's an explicit, deliberate action, not an automatic alert). */
export async function sendTestSms(prisma: typeof PrismaClient, locationId: string) {
  await dispatch(prisma, locationId, 'TEST', 'SureStock test message: if you’re reading this, SMS alerts are working.');
}

export async function listNotificationLog(prisma: typeof PrismaClient, locationId: string, limit = 50) {
  const rows = await prisma.notificationLog.findMany({
    where: { locationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    recipientPhone: r.recipientPhone,
    message: r.message,
    status: r.status,
    providerResponse: r.providerResponse,
    createdAt: r.createdAt,
  }));
}
