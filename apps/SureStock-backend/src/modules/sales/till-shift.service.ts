import { Prisma, type TillShift, type UserRole } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toDecimal, toPesewas } from '../../lib/money.js';
import { HttpError, notFound } from '../../lib/http-error.js';
import type { OpenTillShiftBody, CloseTillShiftBody, ListTillShiftsQuery } from './till-shift.schemas.js';

function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, 'CONFLICT', message, details);
}

function serializeTillShift(shift: TillShift) {
  return {
    id: shift.id,
    userId: shift.userId,
    openedAt: shift.openedAt,
    openingFloat: toPesewas(shift.openingFloat),
    closedAt: shift.closedAt,
    expectedCash: shift.expectedCash !== null ? toPesewas(shift.expectedCash) : null,
    countedCash: shift.countedCash !== null ? toPesewas(shift.countedCash) : null,
    variance: shift.variance !== null ? toPesewas(shift.variance) : null,
    notes: shift.notes,
  };
}

/** Doc 6 T-20: "opening float required before selling" — one open shift per cashier at a time. */
export async function openTillShift(prisma: typeof PrismaClient, userId: string, body: OpenTillShiftBody) {
  const existing = await prisma.tillShift.findFirst({ where: { userId, closedAt: null } });
  if (existing) {
    throw conflict('You already have an open till shift — close it before opening another.', {
      tillShiftId: existing.id,
    });
  }

  const shift = await prisma.tillShift.create({
    data: { id: generateId(), userId, openedAt: new Date(), openingFloat: toDecimal(body.openingFloat) },
  });
  return serializeTillShift(shift);
}

export async function getCurrentTillShift(prisma: typeof PrismaClient, userId: string) {
  const shift = await prisma.tillShift.findFirst({ where: { userId, closedAt: null } });
  return shift ? serializeTillShift(shift) : null;
}

// No Settings mechanism exists yet (T-29, Phase 6) to make this
// per-location configurable — hardcoded interim default. Move to a real
// setting once T-29 exists.
const VARIANCE_ALERT_THRESHOLD_PESEWAS = 2000; // GH₵20.00

/**
 * Doc 6 T-20: "expected cash computed from cash payments plus float
 * minus cash refunds." A refund (T-19) is its own Sale row with its own
 * negative-amount Payment rows tied to whichever shift was open when the
 * refund happened — so a plain sum of every CASH payment amount tied to
 * this shift's sales already nets sales against refunds correctly,
 * without a separate "minus refunds" term.
 */
export async function closeTillShift(
  prisma: typeof PrismaClient,
  userId: string,
  tillShiftId: string,
  body: CloseTillShiftBody,
) {
  const shift = await prisma.tillShift.findUnique({ where: { id: tillShiftId } });
  if (!shift || shift.userId !== userId) throw notFound('Till shift not found.');
  if (shift.closedAt) throw conflict('This till shift is already closed.');

  // CHANGE is its own PaymentMethod (a negative row recording cash handed
  // back on a cash overpayment), not folded into the CASH row itself —
  // see sale.service.ts. Both have to count toward the cash drawer.
  const cashTotal = await prisma.payment.aggregate({
    where: { method: { in: ['CASH', 'CHANGE'] }, status: 'CONFIRMED', sale: { tillShiftId } },
    _sum: { amount: true },
  });
  const cashSum = cashTotal._sum.amount ?? new Prisma.Decimal(0);
  const expectedCash = shift.openingFloat.plus(cashSum);
  const countedCash = toDecimal(body.countedCash);
  const variance = countedCash.minus(expectedCash);

  const updated = await prisma.tillShift.update({
    where: { id: tillShiftId },
    data: { closedAt: new Date(), expectedCash, countedCash, variance, notes: body.notes },
  });

  // "The owner notified beyond a threshold" — no push/SMS/email infra
  // exists to actually deliver a notification, so this writes a real,
  // durable audit-log entry an owner-facing view can surface, rather
  // than faking a delivery channel that doesn't exist.
  if (variance.abs().greaterThan(toDecimal(VARIANCE_ALERT_THRESHOLD_PESEWAS))) {
    await prisma.auditLog.create({
      data: {
        id: generateId(),
        userId,
        action: 'TILL_VARIANCE_ALERT',
        entityType: 'till_shift',
        entityId: tillShiftId,
        after: { variance: toPesewas(variance), expectedCash: toPesewas(expectedCash), countedCash: body.countedCash },
      },
    });
  }

  return serializeTillShift(updated);
}

/**
 * Doc 3 App Flow §5: the Sales screen's "Till shifts" tab. `TillShift`
 * has no `locationId` of its own (it's implicitly location-scoped
 * through the user, same as everywhere else this comes up), so scoping
 * to "this shop" goes through the `user` relation. A CASHIER only ever
 * sees their own shifts, same rule as sales history.
 */
export async function listTillShifts(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  role: UserRole,
  query: ListTillShiftsQuery,
) {
  const where: Prisma.TillShiftWhereInput = { user: { locationId } };
  if (role === 'CASHIER') where.userId = userId;
  else if (query.userId) where.userId = query.userId;

  if (query.status === 'OPEN') where.closedAt = null;
  else if (query.status === 'CLOSED') where.closedAt = { not: null };

  const and: Prisma.TillShiftWhereInput[] = [];
  if (query.dateFrom) and.push({ openedAt: { gte: query.dateFrom } });
  if (query.dateTo) and.push({ openedAt: { lte: query.dateTo } });
  if (and.length) where.AND = and;

  const [rows, totalCount] = await Promise.all([
    prisma.tillShift.findMany({
      where,
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { user: { select: { name: true } } },
    }),
    prisma.tillShift.count({ where }),
  ]);

  return {
    items: rows.map((s) => ({ ...serializeTillShift(s), userName: s.user.name, status: s.closedAt ? 'CLOSED' : 'OPEN' })),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
  };
}
