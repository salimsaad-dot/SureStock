import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { postMovement } from '../inventory/movement.service.js';

describe('refunds (T-19)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerId: string;

  async function makeCashierWithShift() {
    const runSuffix = generateId();
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Refund Test Cashier',
        email: `refund-cashier-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('refund-cashier-password'),
        role: 'CASHIER',
        locationId,
      },
    });
    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identifier: `refund-cashier-${runSuffix}@test.surestock.local`, password: 'refund-cashier-password' },
      })
    ).json().accessToken;
    await app.inject({
      method: 'POST',
      url: '/till-shifts',
      headers: { authorization: `Bearer ${token}` },
      payload: { openingFloat: 0 },
    });
    return token;
  }

  async function makeVariant(sku: string, sellingPricePesewas: number, costPricePesewas: number, quantity: number) {
    const product = await app.prisma.product.create({ data: { id: generateId(), locationId, name: `Refund Test ${sku}` } });
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
    await app.prisma.$transaction((tx) =>
      postMovement(tx, { variantId: variant.id, quantityDelta: quantity, reason: 'OPENING_BALANCE', userId: ownerId }),
    );
    return variant;
  }

  async function makeSale(token: string, variantId: string, quantity: number, unitPricePesewas: number) {
    const total = quantity * unitPricePesewas;
    const res = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ variantId, quantity }],
        payments: [{ method: 'CASH', amount: total }],
      },
    });
    return res.json();
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Refund Test Shop', currency: 'GHS' } });

    ownerId = generateId();
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Refund Owner',
        email: `refund-owner-${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('refund-owner-password'),
        role: 'OWNER',
        locationId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('a full refund with restock returns stock, refunds the full amount, and marks the original REFUNDED', async () => {
    const token = await makeCashierWithShift();
    const variant = await makeVariant('FULL-REFUND-001', 1000, 600, 10);
    const sale = await makeSale(token, variant.id, 3, 1000); // sold 3 @ 1000 = 3000

    const refundId = generateId();
    const refund = await app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: refundId,
        lines: [{ saleLineId: sale.lines[0].id, quantity: 3, restock: true }],
        method: 'CASH',
        reason: 'Customer changed their mind',
      },
    });

    expect(refund.statusCode).toBe(201);
    const body = refund.json();
    expect(body.refundOfSaleId).toBe(sale.id);
    expect(body).toMatchObject({ subtotal: -3000, total: -3000 });
    expect(body.lines[0]).toMatchObject({ quantity: 3, unitPrice: -1000 });
    expect(body.payments[0]).toMatchObject({ method: 'CASH', amount: -3000 });

    const reloadedVariant = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(reloadedVariant.quantityOnHand.toNumber()).toBe(10); // 10 - 3 sold + 3 restocked

    const originalReloaded = await app.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(originalReloaded.status).toBe('REFUNDED');
    // "the original sale is unmodified" — its financial facts are untouched.
    expect(originalReloaded.total.toNumber()).toBe(30);

    const refundMovement = await app.prisma.stockMovement.findFirstOrThrow({ where: { variantId: variant.id, reason: 'REFUND' } });
    expect(refundMovement.quantityDelta.toNumber()).toBe(3);
  });

  it('a partial refund marks the original PARTIALLY_REFUNDED, not REFUNDED', async () => {
    const token = await makeCashierWithShift();
    const variant = await makeVariant('PARTIAL-REFUND-001', 1000, 500, 10);
    const sale = await makeSale(token, variant.id, 5, 1000);

    const refund = await app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ saleLineId: sale.lines[0].id, quantity: 2, restock: true }],
        method: 'CASH',
        reason: 'Two were damaged',
      },
    });
    expect(refund.statusCode).toBe(201);
    expect(refund.json().total).toBe(-2000);

    const originalReloaded = await app.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(originalReloaded.status).toBe('PARTIALLY_REFUNDED');

    // GET /sales/:id on the original now reports how much of that line
    // is already refunded — what a refund UI needs to bound its input.
    const reread = await app.inject({ method: 'GET', url: `/sales/${sale.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(reread.json().lines[0].quantityRefunded).toBe(2);

    // The refund transaction itself isn't refundable, so this is 0 there — meaningless but never undefined.
    const refundReread = await app.inject({ method: 'GET', url: `/sales/${refund.json().id}`, headers: { authorization: `Bearer ${token}` } });
    expect(refundReread.json().lines[0].quantityRefunded).toBe(0);
  });

  it('a write-off refund (no restock) does not return stock and posts no REFUND movement', async () => {
    const token = await makeCashierWithShift();
    const variant = await makeVariant('WRITEOFF-REFUND-001', 1000, 500, 10);
    const sale = await makeSale(token, variant.id, 2, 1000);

    const beforeRefund = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(beforeRefund.quantityOnHand.toNumber()).toBe(8);

    const refund = await app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ saleLineId: sale.lines[0].id, quantity: 2, restock: false }],
        method: 'CASH',
        reason: 'Both were broken, damaged beyond resale',
      },
    });
    expect(refund.statusCode).toBe(201);

    const afterRefund = await app.prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(afterRefund.quantityOnHand.toNumber()).toBe(8); // unchanged — not restocked

    const refundMovement = await app.prisma.stockMovement.findFirst({ where: { variantId: variant.id, reason: 'REFUND' } });
    expect(refundMovement).toBeNull();
  });

  it('refunding more than was sold is rejected, including across two separate refund requests', async () => {
    const token = await makeCashierWithShift();
    const variant = await makeVariant('OVERREFUND-001', 1000, 500, 10);
    const sale = await makeSale(token, variant.id, 3, 1000);

    const tooMuch = await app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ saleLineId: sale.lines[0].id, quantity: 4, restock: true }], method: 'CASH', reason: 'Too many' },
    });
    expect(tooMuch.statusCode).toBe(409);

    const firstPartial = await app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ saleLineId: sale.lines[0].id, quantity: 2, restock: true }], method: 'CASH', reason: 'First partial' },
    });
    expect(firstPartial.statusCode).toBe(201);

    // Only 1 unit left refundable (3 sold - 2 already refunded).
    const secondPartialTooMuch = await app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ saleLineId: sale.lines[0].id, quantity: 2, restock: true }], method: 'CASH', reason: 'Second partial' },
    });
    expect(secondPartialTooMuch.statusCode).toBe(409);
  });

  it('a cart-level discount is prorated into each line, so refunding one line refunds its true post-discount share', async () => {
    const token = await makeCashierWithShift();
    const variantA = await makeVariant('CART-PRORATE-A', 3000, 1500, 10);
    const variantB = await makeVariant('CART-PRORATE-B', 7000, 3500, 10);

    // Subtotal 10000, cart discount 1000 (exactly 10% — under the
    // override threshold, so no manager approval needed). Line A should
    // absorb 300 of it (30% share), line B 700 (70% share).
    const sale = await app.inject({
      method: 'POST',
      url: '/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [
          { variantId: variantA.id, quantity: 1 },
          { variantId: variantB.id, quantity: 1 },
        ],
        cartDiscountAmount: 1000,
        payments: [{ method: 'CASH', amount: 9000 }],
      },
    });
    expect(sale.statusCode).toBe(201);
    const lineA = sale.json().lines.find((l: { variantId: string }) => l.variantId === variantA.id);
    expect(lineA).toMatchObject({ lineTotal: 2700, discountAmount: 300 });

    const refund = await app.inject({
      method: 'POST',
      url: `/sales/${sale.json().id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: generateId(),
        lines: [{ saleLineId: lineA.id, quantity: 1, restock: true }],
        method: 'CASH',
        reason: 'Refunding just the discounted line',
      },
    });
    expect(refund.statusCode).toBe(201);
    // The old, now-fixed bug would have refunded -3000 (the pre-discount
    // price) instead of -2700 (what was actually collected for this line).
    expect(refund.json().total).toBe(-2700);
    expect(refund.json().lines[0]).toMatchObject({ lineTotal: -2700 });
  });

  it('cannot refund a refund', async () => {
    const token = await makeCashierWithShift();
    const variant = await makeVariant('REFUND-OF-REFUND-001', 1000, 500, 10);
    const sale = await makeSale(token, variant.id, 1, 1000);

    const refund = await app.inject({
      method: 'POST',
      url: `/sales/${sale.id}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ saleLineId: sale.lines[0].id, quantity: 1, restock: true }], method: 'CASH', reason: 'Refunding it' },
    });
    const refundSaleId = refund.json().id;

    const refundOfRefund = await app.inject({
      method: 'POST',
      url: `/sales/${refundSaleId}/refund`,
      headers: { authorization: `Bearer ${token}` },
      payload: { id: generateId(), lines: [{ saleLineId: refund.json().lines[0].id, quantity: 1, restock: true }], method: 'CASH', reason: 'Refunding a refund' },
    });
    expect(refundOfRefund.statusCode).toBe(409);
  });

  it('posting the same refund id twice creates exactly one refund', async () => {
    const token = await makeCashierWithShift();
    const variant = await makeVariant('IDEMPOTENT-REFUND-001', 1000, 500, 10);
    const sale = await makeSale(token, variant.id, 2, 1000);

    const refundId = generateId();
    const payload = { id: refundId, lines: [{ saleLineId: sale.lines[0].id, quantity: 2, restock: true }], method: 'CASH', reason: 'Retry test' };

    const first = await app.inject({ method: 'POST', url: `/sales/${sale.id}/refund`, headers: { authorization: `Bearer ${token}` }, payload });
    const second = await app.inject({ method: 'POST', url: `/sales/${sale.id}/refund`, headers: { authorization: `Bearer ${token}` }, payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);

    const count = await app.prisma.sale.count({ where: { id: refundId } });
    expect(count).toBe(1);
  });
});
