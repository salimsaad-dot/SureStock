import { Prisma, type Sale, type SaleLine, type Payment, type UserRole } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toDecimal, toPesewas } from '../../lib/money.js';
import { HttpError, notFound, forbidden } from '../../lib/http-error.js';
import { verifyPin } from '../auth/service.js';
import { postMovement } from '../inventory/movement.service.js';
import type { CreateSaleBody, CreateRefundBody, ListSalesQuery, SalesFilter, SalesStatsQuery } from './sale.schemas.js';

function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, 'CONFLICT', message, details);
}

interface LockedVariantRow {
  id: string;
  sku: string;
  selling_price: Prisma.Decimal;
  cost_price: Prisma.Decimal;
  quantity_on_hand: Prisma.Decimal;
  product_name: string;
  tax_rate_id: string | null;
}

type SaleWithLinesAndPayments = Sale & { lines: SaleLine[]; payments: Payment[] };

function serializeSale(sale: SaleWithLinesAndPayments, role: UserRole, refundedByVariant?: Map<string, Prisma.Decimal>) {
  const base = {
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    locationId: sale.locationId,
    tillShiftId: sale.tillShiftId,
    userId: sale.userId,
    customerId: sale.customerId,
    subtotal: toPesewas(sale.subtotal),
    discountTotal: toPesewas(sale.discountTotal),
    taxTotal: toPesewas(sale.taxTotal),
    total: toPesewas(sale.total),
    status: sale.status,
    refundOfSaleId: sale.refundOfSaleId,
    soldAt: sale.soldAt,
    lines: sale.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      productNameSnapshot: l.productNameSnapshot,
      quantity: l.quantity.toNumber(),
      unitPrice: toPesewas(l.unitPrice),
      discountAmount: l.discountAmount !== null ? toPesewas(l.discountAmount) : null,
      discountReason: l.discountReason,
      lineTotal: toPesewas(l.lineTotal),
      taxAmount: toPesewas(l.taxAmount),
      // Only meaningful on an original (non-refund) sale — 0 whenever the
      // caller didn't compute it (a freshly created sale genuinely has
      // nothing refunded against it yet, so 0 is always correct there too).
      quantityRefunded: refundedByVariant?.get(l.variantId)?.toNumber() ?? 0,
    })),
    payments: sale.payments.map((p) => ({
      id: p.id,
      method: p.method,
      amount: toPesewas(p.amount),
      reference: p.reference,
      provider: p.provider,
      status: p.status,
    })),
  };

  // Same cashier-hides-cost rule as the rest of the API — costTotal and
  // per-line unitCost are margin-revealing, costPrice-adjacent data.
  if (role === 'CASHIER') return base;
  return {
    ...base,
    costTotal: toPesewas(sale.costTotal),
    lines: base.lines.map((l, i) => ({ ...l, unitCost: toPesewas(sale.lines[i]!.unitCost) })),
  };
}

// No Settings mechanism exists yet (T-29) for a real per-location value —
// hardcoded interim default, same as till-shift's variance threshold.
const DISCOUNT_OVERRIDE_THRESHOLD_PERCENT = 10;

/**
 * A cheap, non-locking pre-check so a request missing a required
 * override fails fast, before any row lock is taken. Uses a fresh,
 * unlocked price read — the transaction's own FOR UPDATE read is what
 * actually determines the charged amounts; a price changing in the
 * split second between this check and that read only affects whether
 * this specific check was exactly right, never the sale's correctness.
 */
async function discountRequiresOverride(prisma: typeof PrismaClient, body: CreateSaleBody): Promise<boolean> {
  const variantIds = [...new Set(body.lines.map((l) => l.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, sellingPrice: true },
  });
  const priceById = new Map(variants.map((v) => [v.id, v.sellingPrice]));

  const exceeds = (discountPesewas: number, grossDecimal: Prisma.Decimal) =>
    grossDecimal.greaterThan(0) &&
    toDecimal(discountPesewas).dividedBy(grossDecimal).times(100).greaterThan(DISCOUNT_OVERRIDE_THRESHOLD_PERCENT);

  for (const line of body.lines) {
    if (!line.discountAmount) continue;
    const price = priceById.get(line.variantId);
    if (!price) continue; // a genuinely missing variant surfaces its own 404 inside the transaction
    if (exceeds(line.discountAmount, price.times(line.quantity))) return true;
  }

  if (body.cartDiscountAmount) {
    const subtotal = body.lines.reduce((sum, l) => {
      const price = priceById.get(l.variantId);
      return price ? sum.plus(price.times(l.quantity)) : sum;
    }, new Prisma.Decimal(0));
    if (exceeds(body.cartDiscountAmount, subtotal)) return true;
  }

  return false;
}

/**
 * Doc 6 T-16: "sale, lines, payments, and movements commit in one
 * transaction or not at all... posting the same sale UUID twice creates
 * one sale... two tills selling the last unit concurrently produce a
 * consistent result." This is the single most important write in the
 * system (Backend Integration Blueprint §03) — every guarantee it makes
 * is load-bearing, not decoration:
 *
 *  - Idempotent: `body.id` is the primary key, so a P2002 on retry means
 *    "this exact sale already happened" — the existing row is returned,
 *    not a duplicate.
 *  - Concurrency-safe: every variant touched is locked with a raw
 *    `SELECT ... FOR UPDATE`, in sorted-by-id order (Doc 2 §3.1's
 *    deadlock-avoidance rule) — two tills racing for the last unit
 *    serialize on that lock, so the loser sees the winner's decrement
 *    and fails the stock check honestly instead of both succeeding.
 *  - Price/cost are never trusted from the client — always the fresh,
 *    now-locked variant row (Doc 2 §3.3: "price and cost captured at
 *    that moment").
 */
export async function createSale(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  role: UserRole,
  body: CreateSaleBody,
) {
  const existing = await prisma.sale.findUnique({ where: { id: body.id }, include: { lines: true, payments: true } });
  if (existing) return serializeSale(existing, role);

  const tillShift = await prisma.tillShift.findFirst({ where: { userId, closedAt: null } });
  if (!tillShift) throw conflict('Open a till shift before selling.');

  let approvedByManagerId: string | undefined;
  if (await discountRequiresOverride(prisma, body)) {
    if (!body.managerOverride) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'This discount requires manager approval — enter a manager PIN and a reason.');
    }
    const manager = await verifyPin(prisma, body.managerOverride.managerId, body.managerOverride.managerPin);
    if (manager.role === 'CASHIER') throw forbidden('Only a manager or owner can approve a discount override.');
    approvedByManagerId = manager.id;
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const uniqueVariantIds = [...new Set(body.lines.map((l) => l.variantId))].sort();
      const locked = new Map<string, LockedVariantRow>();
      for (const variantId of uniqueVariantIds) {
        const rows = await tx.$queryRaw<LockedVariantRow[]>(Prisma.sql`
          SELECT pv.id, pv.sku, pv.selling_price, pv.cost_price, pv.quantity_on_hand, p.name AS product_name, p.tax_rate_id
          FROM product_variant pv
          JOIN product p ON p.id = pv.product_id
          WHERE pv.id = ${variantId} AND pv.location_id = ${locationId}
          FOR UPDATE
        `);
        const row = rows[0];
        if (!row) throw notFound(`Variant ${variantId} not found.`);
        locked.set(variantId, row);
      }

      const taxRateIds = [...new Set([...locked.values()].map((v) => v.tax_rate_id).filter((id): id is string => id !== null))];
      const taxRates = await tx.taxRate.findMany({ where: { id: { in: taxRateIds } } });
      const taxRateById = new Map(taxRates.map((t) => [t.id, t]));

      let subtotal = new Prisma.Decimal(0);
      let lineDiscountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      let costTotal = new Prisma.Decimal(0);
      const lineRows: Array<{
        data: Prisma.SaleLineUncheckedCreateInput;
        variantId: string;
        quantity: number;
      }> = [];

      for (const lineInput of body.lines) {
        const variant = locked.get(lineInput.variantId)!;
        const quantity = new Prisma.Decimal(lineInput.quantity);
        const gross = variant.selling_price.times(quantity);
        const discount = lineInput.discountAmount ? toDecimal(lineInput.discountAmount) : new Prisma.Decimal(0);
        const preTax = gross.minus(discount);

        const projected = variant.quantity_on_hand.minus(quantity);
        if (projected.lessThan(0)) {
          throw conflict(`Not enough stock for ${variant.sku} — only ${variant.quantity_on_hand.toString()} available.`, {
            variantId: variant.id,
            available: variant.quantity_on_hand.toNumber(),
            requested: lineInput.quantity,
          });
        }

        const taxRate = variant.tax_rate_id ? taxRateById.get(variant.tax_rate_id) : undefined;
        let taxAmount = new Prisma.Decimal(0);
        let lineTotal = preTax;
        if (taxRate) {
          if (taxRate.isInclusive) {
            taxAmount = preTax.minus(preTax.dividedBy(new Prisma.Decimal(1).plus(taxRate.rate)));
          } else {
            taxAmount = preTax.times(taxRate.rate);
            lineTotal = preTax.plus(taxAmount);
          }
        }

        subtotal = subtotal.plus(gross);
        lineDiscountTotal = lineDiscountTotal.plus(discount);
        taxTotal = taxTotal.plus(taxAmount);
        costTotal = costTotal.plus(variant.cost_price.times(quantity));

        lineRows.push({
          variantId: variant.id,
          quantity: lineInput.quantity,
          data: {
            id: generateId(),
            saleId: body.id,
            variantId: variant.id,
            productNameSnapshot: variant.product_name,
            quantity,
            unitPrice: variant.selling_price,
            unitCost: variant.cost_price,
            discountAmount: discount.greaterThan(0) ? discount : null,
            discountReason: lineInput.discountReason,
            lineTotal,
            taxAmount,
          },
        });
      }

      const cartDiscount = body.cartDiscountAmount ? toDecimal(body.cartDiscountAmount) : new Prisma.Decimal(0);
      const discountTotal = lineDiscountTotal.plus(cartDiscount);

      // Doc 6 T-19's own known gap, closed here: a cart-level discount
      // used to only reduce the sale's grand total, never any single
      // line's stored `lineTotal` — so refunding one line of a
      // cart-discounted sale (createRefund reads `orig.lineTotal`
      // per-line) refunded the pre-discount amount, a real over-refund.
      // Prorating it into each line up front, at the one place a sale's
      // financial facts are ever written, means every reader downstream
      // (refunds, reports, receipts) sees the truth for free — largest-
      // remainder allocation in integer pesewas so the shares sum back
      // to exactly `cartDiscount`, never off by a rounding pesewa.
      if (cartDiscount.greaterThan(0) && lineRows.length > 0) {
        const preDiscountLinesTotalPesewas = lineRows.reduce((sum, l) => sum + toPesewas(l.data.lineTotal as Prisma.Decimal), 0);
        if (preDiscountLinesTotalPesewas > 0) {
          const cartDiscountPesewas = toPesewas(cartDiscount);
          const shares = lineRows.map((l) => {
            const lineTotalPesewas = toPesewas(l.data.lineTotal as Prisma.Decimal);
            const exact = (cartDiscountPesewas * lineTotalPesewas) / preDiscountLinesTotalPesewas;
            return { line: l, share: Math.floor(exact), remainder: exact - Math.floor(exact) };
          });
          let leftover = cartDiscountPesewas - shares.reduce((sum, s) => sum + s.share, 0);
          for (const s of [...shares].sort((a, b) => b.remainder - a.remainder)) {
            if (leftover <= 0) break;
            s.share += 1;
            leftover -= 1;
          }
          for (const s of shares) {
            if (s.share === 0) continue;
            const shareDecimal = toDecimal(s.share);
            const data = s.line.data;
            data.lineTotal = (data.lineTotal as Prisma.Decimal).minus(shareDecimal);
            data.discountAmount = ((data.discountAmount as Prisma.Decimal | null) ?? new Prisma.Decimal(0)).plus(shareDecimal);
          }
        }
      }

      const total = lineRows.reduce((sum, l) => sum.plus(l.data.lineTotal as Prisma.Decimal), new Prisma.Decimal(0));

      const paymentsTotal = body.payments.reduce((sum, p) => sum.plus(toDecimal(p.amount)), new Prisma.Decimal(0));
      if (paymentsTotal.lessThan(total)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Payments do not cover the sale total.', {
          total: toPesewas(total),
          paid: toPesewas(paymentsTotal),
        });
      }
      const changeDue = paymentsTotal.minus(total);
      if (changeDue.greaterThan(0) && !body.payments.some((p) => p.method === 'CASH')) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Change is only given on a cash tender — reduce the payment amount to match the total.');
      }

      const receiptNumber = `RCT-${body.id.replace(/-/g, '').slice(-10).toUpperCase()}`;
      const soldAt = new Date();

      const sale = await tx.sale.create({
        data: {
          id: body.id,
          receiptNumber,
          locationId,
          tillShiftId: tillShift.id,
          userId,
          customerId: body.customerId,
          subtotal,
          discountTotal,
          taxTotal,
          total,
          costTotal,
          soldAt,
          deviceId: body.deviceId,
        },
      });

      await tx.saleLine.createMany({ data: lineRows.map((l) => l.data) });

      for (const line of lineRows) {
        await postMovement(tx, {
          variantId: line.variantId,
          quantityDelta: -line.quantity,
          reason: 'SALE',
          userId,
          referenceType: 'sale',
          referenceId: sale.id,
          unitCost: toPesewas(locked.get(line.variantId)!.cost_price),
        });
      }

      const paymentRows: Prisma.PaymentUncheckedCreateInput[] = body.payments.map((p) => ({
        id: generateId(),
        saleId: sale.id,
        method: p.method,
        amount: toDecimal(p.amount),
        reference: p.reference,
        provider: p.provider,
      }));
      if (changeDue.greaterThan(0)) {
        paymentRows.push({ id: generateId(), saleId: sale.id, method: 'CHANGE', amount: changeDue.negated(), reference: undefined, provider: undefined });
      }
      await tx.payment.createMany({ data: paymentRows });

      if (approvedByManagerId) {
        await tx.auditLog.create({
          data: {
            id: generateId(),
            userId,
            action: 'DISCOUNT_OVERRIDE',
            entityType: 'sale',
            entityId: sale.id,
            after: {
              approvedBy: approvedByManagerId,
              reason: body.managerOverride!.reason,
              discountTotal: toPesewas(discountTotal),
            },
          },
        });
      }

      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true, payments: true } });
    });

    return serializeSale(sale, role);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await prisma.sale.findUnique({ where: { id: body.id }, include: { lines: true, payments: true } });
      if (raced) return serializeSale(raced, role);
    }
    throw err;
  }
}

export async function getSale(prisma: typeof PrismaClient, id: string, role: UserRole) {
  const sale = await prisma.sale.findUnique({ where: { id }, include: { lines: true, payments: true } });
  if (!sale) throw notFound('Sale not found.');

  // A refund sale can't itself be refunded (see createRefund below), so
  // this is only worth computing for an original sale — exactly the
  // case a refund UI needs it for.
  let refundedByVariant: Map<string, Prisma.Decimal> | undefined;
  if (!sale.refundOfSaleId) {
    const priorRefundLines = await prisma.saleLine.findMany({ where: { sale: { refundOfSaleId: sale.id } } });
    refundedByVariant = new Map();
    for (const l of priorRefundLines) {
      refundedByVariant.set(l.variantId, (refundedByVariant.get(l.variantId) ?? new Prisma.Decimal(0)).plus(l.quantity));
    }
  }

  return serializeSale(sale, role, refundedByVariant);
}

/**
 * Shared by every read that lists/aggregates sales for a location — the
 * cashier-scoping rule (Doc 1: cashiers see only their own transactions,
 * Manager/Owner see everyone's) has to be identical everywhere this is
 * used, not re-derived per endpoint.
 */
function buildSalesWhere(locationId: string, userId: string, role: UserRole, filter: SalesFilter): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = { locationId };
  if (role === 'CASHIER') where.userId = userId;
  else if (filter.userId) where.userId = filter.userId;

  if (filter.method) where.payments = { some: { method: filter.method } };

  const and: Prisma.SaleWhereInput[] = [];
  if (filter.dateFrom) and.push({ soldAt: { gte: filter.dateFrom } });
  if (filter.dateTo) and.push({ soldAt: { lte: filter.dateTo } });
  if (and.length) where.AND = and;

  return where;
}

function serializeSaleListItem(s: {
  id: string;
  receiptNumber: string;
  soldAt: Date;
  userId: string;
  user: { name: string };
  total: Prisma.Decimal;
  status: string;
  refundOfSaleId: string | null;
  payments: { method: string }[];
}) {
  return {
    id: s.id,
    receiptNumber: s.receiptNumber,
    soldAt: s.soldAt,
    userId: s.userId,
    userName: s.user.name,
    total: toPesewas(s.total),
    status: s.status,
    refundOfSaleId: s.refundOfSaleId,
    paymentMethods: [...new Set(s.payments.map((p) => p.method))],
  };
}

/**
 * Doc 3 App Flow §5: "a reverse-chronological list filterable by date,
 * staff member, and payment method." Page-number pagination — see the
 * doc comment on `listSalesQuerySchema` for why offset is safe for this
 * specific list (append-only, insert-at-head) when it wouldn't be for
 * T-07's mutable product list.
 */
export async function listSales(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  role: UserRole,
  query: ListSalesQuery,
) {
  const where = buildSalesWhere(locationId, userId, role, query);

  const [rows, totalCount] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { user: { select: { name: true } }, payments: { select: { method: true } } },
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    items: rows.map(serializeSaleListItem),
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
  };
}

/**
 * Doc 4/mockup: KPI cards ("Total Sales," "Transactions," "Completed,"
 * "Refunded," each with a per-day trend) above the history list — not
 * something a single page of `listSales` can answer, since those are
 * aggregates over every matching row, not just the current page.
 * "Completed" / "Refunded" here means "an original sale" vs. "a refund
 * transaction" (`refundOfSaleId` null or not) — a refund row's own
 * `status` field is always `COMPLETED` (only the *original* sale's
 * status moves to `REFUNDED`/`PARTIALLY_REFUNDED`, see createRefund),
 * so that field can't be what these two buckets mean.
 *
 * No date filter defaults to the trailing 14 days — unlike the plain
 * list (which stays unbounded so history can still be paged through
 * indefinitely), a KPI trend is inherently period-shaped and an
 * all-time daily bucket set would be both slow and meaningless once a
 * shop has months of history.
 */
export async function getSalesStats(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  role: UserRole,
  filter: SalesStatsQuery,
) {
  const dateTo = filter.dateTo ?? new Date();
  const dateFrom = filter.dateFrom ?? new Date(dateTo.getTime() - 13 * 24 * 60 * 60 * 1000);
  const where = buildSalesWhere(locationId, userId, role, { ...filter, dateFrom, dateTo });

  const rows = await prisma.sale.findMany({
    where,
    select: { total: true, refundOfSaleId: true, soldAt: true },
  });

  const dailyMap = new Map<string, { totalSales: Prisma.Decimal; transactionCount: number; completedCount: number; refundedCount: number }>();
  let totalSales = new Prisma.Decimal(0);
  let completedCount = 0;
  let refundedCount = 0;

  for (const row of rows) {
    const isRefund = row.refundOfSaleId !== null;
    totalSales = totalSales.plus(row.total);
    if (isRefund) refundedCount++;
    else completedCount++;

    const day = row.soldAt.toISOString().slice(0, 10);
    const bucket = dailyMap.get(day) ?? { totalSales: new Prisma.Decimal(0), transactionCount: 0, completedCount: 0, refundedCount: 0 };
    bucket.totalSales = bucket.totalSales.plus(row.total);
    bucket.transactionCount++;
    if (isRefund) bucket.refundedCount++;
    else bucket.completedCount++;
    dailyMap.set(day, bucket);
  }

  const dailyTrend: { date: string; totalSales: number; transactionCount: number; completedCount: number; refundedCount: number }[] = [];
  for (let d = new Date(dateFrom); d <= dateTo; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    const bucket = dailyMap.get(day);
    dailyTrend.push({
      date: day,
      totalSales: bucket ? toPesewas(bucket.totalSales) : 0,
      transactionCount: bucket?.transactionCount ?? 0,
      completedCount: bucket?.completedCount ?? 0,
      refundedCount: bucket?.refundedCount ?? 0,
    });
  }

  return {
    totalSales: toPesewas(totalSales),
    transactionCount: rows.length,
    completedCount,
    refundedCount,
    dailyTrend,
  };
}

/**
 * Doc 3 App Flow §5's "Export report" — a plain CSV of every row
 * matching the same filters as the history list, not just the current
 * page. No PDF export (that would need a new rendering dependency, a
 * real decision to make deliberately, not add unprompted).
 */
export async function exportSalesCsv(prisma: typeof PrismaClient, locationId: string, userId: string, role: UserRole, filter: SalesFilter) {
  const where = buildSalesWhere(locationId, userId, role, filter);
  const rows = await prisma.sale.findMany({
    where,
    orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
    include: { user: { select: { name: true } }, payments: { select: { method: true } } },
  });

  const header = ['Receipt', 'Date', 'Staff', 'Payment method', 'Type', 'Total (GH₵)'];
  const csvRows = rows.map((s) => {
    const item = serializeSaleListItem(s);
    return [
      item.receiptNumber,
      item.soldAt.toISOString(),
      item.userName,
      item.paymentMethods.join('; '),
      item.refundOfSaleId ? 'Refund' : 'Sale',
      (item.total / 100).toFixed(2),
    ];
  });

  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return [header, ...csvRows].map((row) => row.map(escape).join(',')).join('\r\n');
}

/**
 * Doc 6 T-19: "partial and full refunds create a linked negative
 * transaction; restocked items return to inventory, written-off items
 * do not; the original sale is unmodified; refunds cannot exceed what
 * was sold." "Unmodified" means the original's financial facts never
 * change — the Backend Integration Blueprint's own walkthrough B is
 * explicit that its `status` *does* move to `PARTIALLY_REFUNDED` /
 * `REFUNDED`, which is exactly what `SaleStatus` has those values for.
 *
 * The schema has no direct FK from a refund's `SaleLine` back to the
 * specific original `SaleLine` it corresponds to, so "how much of this
 * line has already been refunded" is computed by summing prior refund
 * lines for this original sale by `variantId` — correct as long as an
 * original sale never has two lines for the same variant, which is how
 * a cart is expected to work (one line per SKU, quantity edited in
 * place, not duplicated).
 *
 * Refund amounts are computed per-line from that line's own
 * `unitPrice`/`discountAmount`/`taxAmount`/`lineTotal` — a cart-level
 * discount is no longer a gap here because `createSale` now prorates it
 * into each line's stored `lineTotal`/`discountAmount` at write time
 * (see the proration block there), so this reads the true post-discount
 * amount for free without needing to know anything about carts.
 */
export async function createRefund(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  role: UserRole,
  originalSaleId: string,
  body: CreateRefundBody,
) {
  const existing = await prisma.sale.findUnique({ where: { id: body.id }, include: { lines: true, payments: true } });
  if (existing) return serializeSale(existing, role);

  const original = await prisma.sale.findUnique({ where: { id: originalSaleId }, include: { lines: true } });
  if (!original || original.locationId !== locationId) throw notFound('Sale not found.');
  if (original.refundOfSaleId) throw conflict('Cannot refund a refund — refund the original sale instead.');

  const tillShift = await prisma.tillShift.findFirst({ where: { userId, closedAt: null } });
  if (!tillShift) throw conflict('Open a till shift before processing a refund.');

  const originalLineById = new Map(original.lines.map((l) => [l.id, l]));
  for (const rl of body.lines) {
    if (!originalLineById.has(rl.saleLineId)) throw notFound(`Sale line ${rl.saleLineId} not found on this sale.`);
  }

  const priorRefundLines = await prisma.saleLine.findMany({ where: { sale: { refundOfSaleId: original.id } } });
  const alreadyRefundedByVariant = new Map<string, Prisma.Decimal>();
  for (const l of priorRefundLines) {
    alreadyRefundedByVariant.set(l.variantId, (alreadyRefundedByVariant.get(l.variantId) ?? new Prisma.Decimal(0)).plus(l.quantity));
  }

  try {
    const refundSale = await prisma.$transaction(async (tx) => {
      let subtotal = new Prisma.Decimal(0);
      let discountTotal = new Prisma.Decimal(0);
      let taxTotal = new Prisma.Decimal(0);
      let refundTotal = new Prisma.Decimal(0);
      let costTotal = new Prisma.Decimal(0);
      const lineData: Prisma.SaleLineUncheckedCreateInput[] = [];
      const restockByVariant = new Map<string, Prisma.Decimal>();

      for (const rl of body.lines) {
        const orig = originalLineById.get(rl.saleLineId)!;
        const refundQty = new Prisma.Decimal(rl.quantity);
        const alreadyRefunded = alreadyRefundedByVariant.get(orig.variantId) ?? new Prisma.Decimal(0);
        const maxRefundable = orig.quantity.minus(alreadyRefunded);
        if (refundQty.greaterThan(maxRefundable)) {
          throw conflict(`Cannot refund ${rl.quantity} of ${orig.productNameSnapshot} — only ${maxRefundable.toString()} refundable.`, {
            saleLineId: rl.saleLineId,
            maxRefundable: maxRefundable.toNumber(),
          });
        }
        // Reserve this refund's own quantity against a second line of the
        // same variant in the same request too.
        alreadyRefundedByVariant.set(orig.variantId, alreadyRefunded.plus(refundQty));

        const perUnitDiscount = orig.discountAmount ? orig.discountAmount.dividedBy(orig.quantity) : new Prisma.Decimal(0);
        const perUnitTax = orig.taxAmount.dividedBy(orig.quantity);
        const perUnitTotal = orig.lineTotal.dividedBy(orig.quantity);

        const lineSubtotal = orig.unitPrice.times(refundQty).negated();
        const lineDiscount = perUnitDiscount.times(refundQty).negated();
        const lineTax = perUnitTax.times(refundQty).negated();
        const lineTotal = perUnitTotal.times(refundQty).negated();
        const lineCost = orig.unitCost.times(refundQty).negated();

        subtotal = subtotal.plus(lineSubtotal);
        discountTotal = discountTotal.plus(lineDiscount);
        taxTotal = taxTotal.plus(lineTax);
        refundTotal = refundTotal.plus(lineTotal);
        costTotal = costTotal.plus(lineCost);

        lineData.push({
          id: generateId(),
          saleId: body.id,
          variantId: orig.variantId,
          productNameSnapshot: orig.productNameSnapshot,
          quantity: refundQty,
          unitPrice: orig.unitPrice.negated(),
          unitCost: orig.unitCost,
          discountAmount: lineDiscount.equals(0) ? null : lineDiscount,
          discountReason: body.reason,
          lineTotal,
          taxAmount: lineTax,
        });

        if (rl.restock) {
          restockByVariant.set(orig.variantId, (restockByVariant.get(orig.variantId) ?? new Prisma.Decimal(0)).plus(refundQty));
        }
      }

      const receiptNumber = `RCT-${body.id.replace(/-/g, '').slice(-10).toUpperCase()}`;

      const sale = await tx.sale.create({
        data: {
          id: body.id,
          receiptNumber,
          locationId,
          tillShiftId: tillShift.id,
          userId,
          customerId: original.customerId,
          subtotal,
          discountTotal,
          taxTotal,
          total: refundTotal,
          costTotal,
          refundOfSaleId: original.id,
          soldAt: new Date(),
        },
      });

      await tx.saleLine.createMany({ data: lineData });

      for (const [variantId, quantity] of restockByVariant) {
        await postMovement(tx, {
          variantId,
          quantityDelta: quantity.toNumber(),
          reason: 'REFUND',
          userId,
          referenceType: 'sale',
          referenceId: sale.id,
        });
      }

      await tx.payment.create({
        data: { id: generateId(), saleId: sale.id, method: body.method, amount: refundTotal },
      });

      const allLinesFullyRefunded = original.lines.every((l) => {
        const refunded = alreadyRefundedByVariant.get(l.variantId) ?? new Prisma.Decimal(0);
        return refunded.greaterThanOrEqualTo(l.quantity);
      });
      await tx.sale.update({
        where: { id: original.id },
        data: { status: allLinesFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });

      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { lines: true, payments: true } });
    });

    return serializeSale(refundSale, role);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await prisma.sale.findUnique({ where: { id: body.id }, include: { lines: true, payments: true } });
      if (raced) return serializeSale(raced, role);
    }
    throw err;
  }
}
