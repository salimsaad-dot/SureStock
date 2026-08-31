import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword, hashPin } from '../auth/service.js';
import { postMovement } from '../inventory/movement.service.js';

describe('sale write (T-16, T-18)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;
  let managerId: string;
  let managerPin: string;
  let ownerToken: string;

  async function makeCashierWithShift(openingFloat = 0) {
    const runSuffix = generateId();
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Sale Test Cashier',
        email: `sale-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('sale-cashier-password'),
        role: 'CASHIER',
        locationId,
      },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `sale-cashier-${runSuffix}@test.surestock.local`, password: 'sale-cashier-password' },
      })
    ).json().accessToken;
    const open = await app.inject({
      method: 'POST',
      url: '/till-shifts',
      headers: { authorization: `Bearer ${token}` },
      payload: { openingFloat },
    });
    return { cashierId, token, tillShiftId: open.json().id };
  }

  async function makeVariant(sku: string, sellingPricePesewas: number, costPricePesewas: number, quantity: number) {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: `Sale Test ${sku}` } });
    const variant = await app.prisma.productVariant.create({
      data: {
        id: generateId(),
        productId: product.id,
        sku,
        costPrice: costPricePesewas / 100,
        sellingPrice: sellingPricePesewas / 100,
        quantityOnHand: 0,
        locationId,
      },
    });
    if (quantity > 0) {
      await app.prisma.$transaction((tx) =>
        postMovement(tx, { variantId: variant.id, quantityDelta: quantity, reason: 'OPENING_BALANCE', userId: ownerId }),
      );
    }
    return variant;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Sale Test Shop', currency: 'GHS' } });

    const runSuffix = generateId();
    ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Sale Owner',
        email: `sale-owner-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('sale-owner-password'),
        role: 'OWNER',
        locationId,
      },
    });
    ownerToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `sale-owner-${runSuffix}@test.surestock.local`, password: 'sale-owner-password' },
      })
    ).json().accessToken;

    managerId = generateId();
    managerPin = '4321';
    await app.prisma.user.create({
      data: {
        id: managerId,
        name: 'Sale Manager',
        email: `sale-manager-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('sale-manager-password'),
        pinHash: await hashPin(managerPin),
        role: 'MANAGER',
        locationId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('a basic cash sale creates the sale, lines, payment, and decrements stock in one commit', async () => {
    const { token, tillShiftId } = await makeCashierWithShift();
    const variant = await makeVariant('BASIC-001', 1000, 600, 20);

    const saleId = generateId();
    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: saleId,
        lines: [{ variantId: variant.id, quantity: 3 }],
        payments: [{ method: 'CASH', amount: 3000 }],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.tillShiftId).toBe(tillShiftId);
    expect(body).toMatchObject({ subtotal: 3000, discountTotal: 0, total: 3000, status: 'COMPLETED' });
    expect(body.receiptNumber).toMatch(/^RCT-/);
    expect(body.lines[0]).toMatchObject({ variantId: variant.id, quantity: 3, unitPrice: 1000, lineTotal: 3000 });
    expect(body.payments[0]).toMatchObject({ method: 'CASH', amount: 3000 });

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(17);

    const movement = await app.prisma.stockMovement.findFirstOrThrow({ where: { variantId: variant.id, reason: 'SALE' } });
    expect(movement.quantityDelta.toNumber()).toBe(-3);
    expect(movement.referenceId).toBe(saleId);
  });

  it('posting the same sale id twice creates exactly one sale and decrements stock only once', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('IDEMPOTENT-001', 500, 200, 10);
    const saleId = generateId();
    const payload = {
      id: saleId,
      lines: [{ variantId: variant.id, quantity: 2 }],
      payments: [{ method: 'CASH', amount: 1000 }],
    };

    const first = await app.inject({ method: 'POST', url: '/sales', headers: { authorization: `Bearer ${token}` }, payload });
    const second = await app.inject({ method: 'POST', url: '/sales', headers: { authorization: `Bearer ${token}` }, payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);

    const salesCount = await app.prisma.sale.count({ where: { id: saleId } });
    expect(salesCount).toBe(1);
    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(8); // decremented once, not twice
  });

  it('split tender with cash overpayment produces a CHANGE payment for exactly the right amount', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('CHANGE-001', 1200, 700, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1 }], // total 1200
        payments: [
          { method: 'MOBILE_MONEY', amount: 700 },
          { method: 'CASH', amount: 1000 }, // 700+1000 = 1700, 500 change due
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const payments = res.json().payments;
    expect(payments).toHaveLength(3);
    const change = payments.find((p: { method: string }) => p.method === 'CHANGE');
    expect(change).toMatchObject({ amount: -500 });
  });

  it('rejects a cash overpayment ("change") when no payment is actually cash', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('NOCASH-CHANGE-001', 1000, 500, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1 }],
        payments: [{ method: 'MOBILE_MONEY', amount: 1500 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a sale when payments do not cover the total', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('UNDERPAY-001', 1000, 500, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 500 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a sale line that would take stock negative, and persists nothing from that attempt', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('OVERSELL-001', 1000, 500, 2);
    const saleId = generateId();

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: saleId,
        lines: [{ variantId: variant.id, quantity: 5 }],
        payments: [{ method: 'CASH', amount: 5000 }],
      },
    });
    expect(res.statusCode).toBe(409);

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(2); // untouched
    const sale = await app.prisma.sale.findUnique({ where: { id: saleId } });
    expect(sale).toBeNull(); // nothing committed
  });

  it('two tills selling the last unit concurrently produce a consistent result — exactly one succeeds', async () => {
    const { token: tokenA } = await makeCashierWithShift();
    const { token: tokenB } = await makeCashierWithShift();
    const variant = await makeVariant('CONCURRENT-001', 1000, 500, 1); // exactly one unit

    const attempt = (token: string) =>
      app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          id: generateId(),
          lines: [{ variantId: variant.id, quantity: 1 }],
          payments: [{ method: 'CASH', amount: 1000 }],
        },
      });

    const [resA, resB] = await Promise.all([attempt(tokenA), attempt(tokenB)]);
    const statuses = [resA.statusCode, resB.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const reloaded = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloaded.quantityOnHand.toNumber()).toBe(0); // never negative, never double-sold
  });

  it('a line discount under the threshold applies without needing a manager override', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('SMALL-DISCOUNT-001', 1000, 500, 10); // 5% discount on a 1000 line is under 10%

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1, discountAmount: 50, discountReason: 'Loyalty' }],
        payments: [{ method: 'CASH', amount: 950 }],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ discountTotal: 50, total: 950 });
  });

  it('a discount above the threshold is rejected without a manager override, and accepted with a valid one', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('BIG-DISCOUNT-001', 1000, 500, 10); // 30% discount, well above 10%

    const withoutOverride = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1, discountAmount: 300 }],
        payments: [{ method: 'CASH', amount: 700 }],
      },
    });
    expect(withoutOverride.statusCode).toBe(400);

    const saleId = generateId();
    const withOverride = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: saleId,
        lines: [{ variantId: variant.id, quantity: 1, discountAmount: 300 }],
        payments: [{ method: 'CASH', amount: 700 }],
        managerOverride: { managerId, managerPin, reason: 'Regular customer, manager approved' },
      },
    });
    expect(withOverride.statusCode).toBe(201);
    expect(withOverride.json()).toMatchObject({ discountTotal: 300, total: 700 });

    const audit = await app.prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'sale', entityId: saleId, action: 'DISCOUNT_OVERRIDE' },
    });
    expect(audit.userId).not.toBeNull(); // the cashier who made the sale
    expect(audit.after).toMatchObject({ approvedBy: managerId, reason: 'Regular customer, manager approved' });
  });

  it('a discount override is rejected if the PIN belongs to a cashier, not a manager or owner', async () => {
    const { token, cashierId } = await makeCashierWithShift();
    const pin = '1234';
    await app.prisma.user.update({ where: { id: cashierId }, data: { pinHash: await hashPin(pin) } });
    const variant = await makeVariant('CASHIER-OVERRIDE-001', 1000, 500, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1, discountAmount: 300 }],
        payments: [{ method: 'CASH', amount: 700 }],
        managerOverride: { managerId: cashierId, managerPin: pin, reason: 'Attempting self-approval' },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('a cart-level discount above the threshold also requires override', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('CART-DISCOUNT-001', 1000, 500, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1 }],
        cartDiscountAmount: 500, // 50% of subtotal
        payments: [{ method: 'CASH', amount: 500 }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a sale from a cashier with no open till shift', async () => {
    const runSuffix = generateId();
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'No Shift Cashier',
        email: `no-shift-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('no-shift-password'),
        role: 'CASHIER',
        locationId,
      },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `no-shift-cashier-${runSuffix}@test.surestock.local`, password: 'no-shift-password' },
      })
    ).json().accessToken;
    const variant = await makeVariant('NO-SHIFT-001', 1000, 500, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 1000 }],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('cost data is hidden from a cashier reading a sale back, visible to the owner', async () => {
    const { token } = await makeCashierWithShift();
    const variant = await makeVariant('COST-VISIBILITY-001', 1000, 400, 10);

    const create = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId: variant.id, quantity: 1 }],
        payments: [{ method: 'CASH', amount: 1000 }],
      },
    });
    const saleId = create.json().id;
    expect(create.json().costTotal).toBeUndefined(); // creator is a cashier

    const asCashier = await app.inject({ method: 'GET', url: `/sales/${saleId}`, headers: { authorization: `Bearer ${token}` } });
    expect(asCashier.json().costTotal).toBeUndefined();
    expect(asCashier.json().lines[0].unitCost).toBeUndefined();

    const asOwner = await app.inject({ method: 'GET', url: `/sales/${saleId}`, headers: { authorization: `Bearer ${ownerToken}` } });
    expect(asOwner.json().costTotal).toBe(400);
    expect(asOwner.json().lines[0].unitCost).toBe(400);
  });

  describe('list sales (App Flow §5 history)', () => {
    it('a cashier only ever sees their own sales, even when asking for another userId', async () => {
      const alice = await makeCashierWithShift();
      const bob = await makeCashierWithShift();
      const variant = await makeVariant('LIST-SCOPE-001', 1000, 400, 10);

      await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${alice.token}` },
        payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
      });
      await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${bob.token}` },
        payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
      });

      const asAlice = await app.inject({
        method: 'GET',
        url: `/sales?userId=${bob.cashierId}`, // trying to look at Bob's sales
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(asAlice.json().items.every((s: { userId: string }) => s.userId === alice.cashierId)).toBe(true);
    });

    it('an owner can filter by staff member and by payment method', async () => {
      const cashier = await makeCashierWithShift();
      const variant = await makeVariant('LIST-FILTER-001', 1000, 400, 10);

      const cashSale = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${cashier.token}` },
        payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
      });
      const momoSale = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${cashier.token}` },
        payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'MOBILE_MONEY', amount: 1000 }] },
      });

      const byStaff = await app.inject({
        method: 'GET',
        url: `/sales?userId=${cashier.cashierId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const staffIds = byStaff.json().items.map((s: { id: string }) => s.id);
      expect(staffIds).toEqual(expect.arrayContaining([cashSale.json().id, momoSale.json().id]));

      const byMethod = await app.inject({
        method: 'GET',
        url: '/sales?method=MOBILE_MONEY',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const methodIds = byMethod.json().items.map((s: { id: string }) => s.id);
      expect(methodIds).toContain(momoSale.json().id);
      expect(methodIds).not.toContain(cashSale.json().id);
    });

    it('is reverse-chronological and paginates by page number without skipping or duplicating', async () => {
      const cashier = await makeCashierWithShift();
      const variant = await makeVariant('LIST-PAGE-001', 1000, 400, 10);

      const created: string[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/sales',
          headers: { authorization: `Bearer ${cashier.token}` },
          payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
        });
        created.push(res.json().id);
      }

      const page1 = await app.inject({
        method: 'GET',
        url: `/sales?userId=${cashier.cashierId}&page=1&pageSize=2`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(page1.json().items).toHaveLength(2);
      expect(page1.json()).toMatchObject({ page: 1, pageSize: 2, totalCount: 5, totalPages: 3 });

      const page2 = await app.inject({
        method: 'GET',
        url: `/sales?userId=${cashier.cashierId}&page=2&pageSize=2`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(page2.json().items).toHaveLength(2);

      const page1Ids = page1.json().items.map((s: { id: string }) => s.id);
      const page2Ids = page2.json().items.map((s: { id: string }) => s.id);
      expect(new Set([...page1Ids, ...page2Ids]).size).toBe(4); // no duplicates across pages

      // Reverse-chronological: the 5th-created sale should be first.
      expect(page1Ids[0]).toBe(created[4]);
    });
  });

  describe('sales stats (KPI cards)', () => {
    it('computes net total, transaction/completed/refunded counts, and a per-day trend over the filtered range', async () => {
      const cashier = await makeCashierWithShift();
      const variant = await makeVariant('STATS-001', 1000, 400, 10);

      const sale = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${cashier.token}` },
        payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 2 }], payments: [{ method: 'CASH', amount: 2000 }] },
      });
      await app.inject({
        method: 'POST',
        url: `/sales/${sale.json().id}/refund`,
        headers: { authorization: `Bearer ${cashier.token}` },
        payload: { id: generateId(), lines: [{ saleLineId: sale.json().lines[0].id, quantity: 1, restock: true }], method: 'CASH', reason: 'test' },
      });

      const stats = await app.inject({
        method: 'GET',
        url: `/sales/stats?userId=${cashier.cashierId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(stats.statusCode).toBe(200);
      const body = stats.json();
      expect(body.transactionCount).toBeGreaterThanOrEqual(2);
      expect(body.completedCount).toBeGreaterThanOrEqual(1);
      expect(body.refundedCount).toBeGreaterThanOrEqual(1);
      expect(body.totalSales).toBe(1000); // 2000 sold - 1000 refunded, net
      expect(Array.isArray(body.dailyTrend)).toBe(true);
      expect(body.dailyTrend.length).toBeGreaterThanOrEqual(1);
      const today = body.dailyTrend.at(-1);
      expect(today.transactionCount).toBeGreaterThanOrEqual(2);
    });

    it('a cashier only sees their own sales in the stats too', async () => {
      const alice = await makeCashierWithShift();
      const bob = await makeCashierWithShift();
      const variant = await makeVariant('STATS-SCOPE-001', 1000, 400, 10);

      await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${bob.token}` },
        payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
      });

      const asAlice = await app.inject({
        method: 'GET',
        url: `/sales/stats?userId=${bob.cashierId}`, // trying to look at Bob's stats
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(asAlice.json().transactionCount).toBe(0);
    });
  });

  describe('sales CSV export', () => {
    it('exports every matching row as CSV, not just one page', async () => {
      const cashier = await makeCashierWithShift();
      const variant = await makeVariant('EXPORT-001', 1000, 400, 10);

      const sale = await app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${cashier.token}` },
        payload: { id: generateId(), lines: [{ variantId: variant.id, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/sales/export?userId=${cashier.cashierId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.body).toContain('Receipt,Date,Staff,Payment method,Type,Total');
      expect(res.body).toContain(sale.json().receiptNumber);
    });
  });
});
