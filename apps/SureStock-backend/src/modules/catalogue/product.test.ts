import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const OWNER_PASSWORD = 'owner-password-product-test';
const CASHIER_PASSWORD = 'cashier-password-product-test';

describe('product and variant routes', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let cashierToken: string;
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Product Test Shop', currency: 'GHS' } });

    // Suffixed with a fresh id, not a fixed literal: this file's own
    // opening-stock test permanently pins its owner user (a
    // stock_movement.userId RESTRICT reference — same reasoning as the
    // afterAll comment below), so a fixed email would collide with that
    // leftover row on every run after the first. Never colliding in the
    // first place is simpler than relying on being able to clean it up.
    const runSuffix = generateId();
    const ownerEmail = `product-owner-${runSuffix}@test.surestock.local`;
    const cashierEmail = `product-cashier-${runSuffix}@test.surestock.local`;

    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Product Owner',
        email: ownerEmail,
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Product Cashier',
        email: cashierEmail,
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        role: 'CASHIER',
        locationId,
      },
    });
    createdUserIds.push(ownerId, cashierId);

    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: ownerEmail, password: OWNER_PASSWORD },
    });
    ownerToken = ownerLogin.json().accessToken;

    const cashierLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: cashierEmail, password: CASHIER_PASSWORD },
    });
    cashierToken = cashierLogin.json().accessToken;
  });

  afterAll(async () => {
    // Deliberately doesn't touch stock_movement or the products/variants
    // tied to it: the append-only trigger really does block DELETE
    // unconditionally (proven by the opening-stock test below), and the
    // RESTRICT foreign key means a variant with a movement — and the
    // location that variant belongs to — can't be deleted either, by
    // design. That's correct behavior working as intended, not a test
    // bug to work around; the one product this applies to (and its own
    // dedicated location, created in that test) is simply left behind
    // in this throwaway test database rather than fought. Filtered for
    // `undefined` defensively — a test whose create request came back
    // non-201 (e.g. an unexpected conflict) would otherwise push
    // `undefined` from `.json().id` and crash Prisma's query validation
    // before any real cleanup runs at all.
    const productIds = createdProductIds.filter((id): id is string => Boolean(id));
    await app.prisma.priceHistory.deleteMany({
      where: { variant: { product: { id: { in: productIds } } } },
    });
    await app.prisma.productVariant.deleteMany({
      where: { productId: { in: productIds }, stockMovements: { none: {} } },
    });
    await app.prisma.product.deleteMany({ where: { id: { in: productIds }, variants: { none: {} } } });
    // Individually, not deleteMany: the owner user is also permanently
    // pinned (stock_movement.userId, same RESTRICT reasoning as above),
    // and a single batched DELETE would fail atomically on that one row
    // and take the otherwise-removable cashier down with it.
    for (const id of createdUserIds) {
      await app.prisma.user.delete({ where: { id } }).catch(() => {});
    }
    // Location not deleted: the opening-stock variant above permanently
    // references it (RESTRICT), same reasoning as the product/variant
    // skip above. Left behind in the test database.
    await app.close();
  });

  it('a product with three variants saves and reloads intact, with opening stock posted as a real movement', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Sugar Bread Loaf',
        unit: 'EACH',
        variants: [
          { sku: 'BRD-SML', variantName: 'Small', costPrice: 800, sellingPrice: 1200, openingQuantity: 5 },
          { sku: 'BRD-MED', variantName: 'Medium', costPrice: 1000, sellingPrice: 1500 },
          { sku: 'BRD-LGE', variantName: 'Large', costPrice: 1300, sellingPrice: 1900 },
        ],
      },
    });
    expect(create.statusCode).toBe(201);
    const productId = create.json().id;
    createdProductIds.push(productId);
    expect(create.json().variants).toHaveLength(3);

    const reloaded = await app.inject({
      method: 'GET',
      url: `/products/${productId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(reloaded.statusCode).toBe(200);
    const body = reloaded.json();
    expect(body.name).toBe('Sugar Bread Loaf');
    expect(body.variants).toHaveLength(3);

    const small = body.variants.find((v: { sku: string }) => v.sku === 'BRD-SML');
    expect(small).toMatchObject({ costPrice: 800, sellingPrice: 1200, quantityOnHand: 5 });

    const movement = await app.prisma.stockMovement.findFirst({ where: { variantId: small.id } });
    expect(movement).toMatchObject({ reason: 'OPENING_BALANCE' });
    expect(movement?.quantityDelta.toNumber()).toBe(5);

    const noOpeningStock = body.variants.find((v: { sku: string }) => v.sku === 'BRD-MED');
    expect(noOpeningStock.quantityOnHand).toBe(0);
  });

  it('rejects a duplicate SKU at the same location with a clear message, without touching the barcode path', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Duplicate SKU Test A',
        variants: [{ sku: 'DUP-SKU-001', costPrice: 100, sellingPrice: 150 }],
      },
    });
    createdProductIds.push(first.json().id);

    const second = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Duplicate SKU Test B',
        variants: [{ sku: 'DUP-SKU-001', costPrice: 100, sellingPrice: 150 }],
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().message).toMatch(/SKU/i);
  });

  it('rejects a duplicate barcode with a clear message', async () => {
    // Unlike sku (unique per location, so naturally safe across a fresh
    // locationId each run), barcode is globally unique with no location
    // scoping — a fixed literal here would collide with a leftover row
    // from any earlier run of this same test.
    const barcode = `600${generateId().replace(/-/g, '').slice(0, 10)}`;

    const first = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Duplicate Barcode Test A',
        variants: [{ sku: 'BC-SKU-A', barcode, costPrice: 100, sellingPrice: 150 }],
      },
    });
    createdProductIds.push(first.json().id);

    const second = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Duplicate Barcode Test B',
        variants: [{ sku: 'BC-SKU-B', barcode, costPrice: 100, sellingPrice: 150 }],
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().message).toMatch(/barcode/i);
  });

  it('a selling price change writes a price_history row, and requires a reason', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Price History Test',
        variants: [{ sku: 'PRICE-001', costPrice: 500, sellingPrice: 1000 }],
      },
    });
    const productId = create.json().id;
    createdProductIds.push(productId);
    const variantId = create.json().variants[0].id;

    const withoutReason = await app.inject({
      method: 'PATCH',
      url: `/products/${productId}/variants/${variantId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { sellingPrice: 1100 },
    });
    expect(withoutReason.statusCode).toBe(400);

    const withReason = await app.inject({
      method: 'PATCH',
      url: `/products/${productId}/variants/${variantId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { sellingPrice: 1100, priceChangeReason: 'Supplier cost increase' },
    });
    expect(withReason.statusCode).toBe(200);
    expect(withReason.json().sellingPrice).toBe(1100);

    const history = await app.prisma.priceHistory.findFirst({ where: { variantId } });
    expect(history).not.toBeNull();
    expect(history?.oldPrice.toNumber()).toBe(10);
    expect(history?.newPrice.toNumber()).toBe(11);
    expect(history?.reason).toBe('Supplier cost increase');
  });

  it('cost price is hidden from cashiers in the API response, not just the UI', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        name: 'Cost Visibility Test',
        variants: [{ sku: 'COST-VIS-001', costPrice: 700, sellingPrice: 1200 }],
      },
    });
    const productId = create.json().id;
    createdProductIds.push(productId);
    expect(create.json().variants[0].costPrice).toBe(700); // owner sees it on create

    const asCashier = await app.inject({
      method: 'GET',
      url: `/products/${productId}`,
      headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(asCashier.statusCode).toBe(200);
    expect(asCashier.json().variants[0].costPrice).toBeUndefined();
    expect(asCashier.json().variants[0].sellingPrice).toBe(1200); // selling price is not hidden

    const asOwner = await app.inject({
      method: 'GET',
      url: `/products/${productId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(asOwner.json().variants[0].costPrice).toBe(700);
  });

  it('a cashier cannot create a product', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${cashierToken}` },
      payload: { name: 'Should Not Be Created', variants: [{ sku: 'FORBIDDEN-001', costPrice: 1, sellingPrice: 2 }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('discontinuing a product changes its status without deleting it', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Discontinue Test', variants: [{ sku: 'DISC-001', costPrice: 100, sellingPrice: 200 }] },
    });
    const productId = create.json().id;
    createdProductIds.push(productId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/products/${productId}/status`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { status: 'DISCONTINUED' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('DISCONTINUED');

    const stillReadable = await app.inject({
      method: 'GET',
      url: `/products/${productId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(stillReadable.statusCode).toBe(200);
  });

  describe('Sell screen quick-picks: popular and recent products (App Flow §3)', () => {
    async function makeProduct(name: string, sku: string, sellingPrice: number, categoryId?: string) {
      const res = await app.inject({
        method: 'POST',
        url: '/products',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name,
          categoryId,
          variants: [{ sku, costPrice: Math.round(sellingPrice / 2), sellingPrice, openingQuantity: 100 }],
        },
      });
      createdProductIds.push(res.json().id);
      return { productId: res.json().id, variantId: res.json().variants[0].id };
    }

    // Doc 6 T-20: one open shift per cashier — opening a second one 409s,
    // which is fine here since `POST /sales` only needs *some* shift
    // open for this user, not a fresh one per call.
    async function sell(variantId: string, quantity: number) {
      await app.inject({
        method: 'POST',
        url: '/till-shifts',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: { openingFloat: 0 },
      });
      return app.inject({
        method: 'POST',
        url: '/sales',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: { id: generateId(), lines: [{ variantId, quantity }], payments: [{ method: 'CASH', amount: 100_000 }] },
      });
    }

    it('ranks popular products by real units sold, not by creation order or alphabetically', async () => {
      const category = await app.prisma.category.create({ data: { id: generateId(), name: `Popular Test Cat ${generateId()}` } });
      const low = await makeProduct('Zzz Low Seller', `POP-LOW-${generateId()}`, 500, category.id);
      const high = await makeProduct('Aaa High Seller', `POP-HIGH-${generateId()}`, 500, category.id);

      await sell(low.variantId, 1);
      await sell(high.variantId, 5);
      await sell(high.variantId, 3);

      const res = await app.inject({
        method: 'GET',
        url: `/products/popular?categoryId=${category.id}`,
        headers: { authorization: `Bearer ${cashierToken}` },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().map((p: { id: string }) => p.id);
      expect(ids.indexOf(high.variantId)).toBeLessThan(ids.indexOf(low.variantId));
    });

    it('recent products returns the most recently sold distinct products, newest first, excluding refunds', async () => {
      const older = await makeProduct('Recent Test Older', `REC-OLD-${generateId()}`, 500);
      const newer = await makeProduct('Recent Test Newer', `REC-NEW-${generateId()}`, 500);

      await sell(older.variantId, 1);
      await new Promise((r) => setTimeout(r, 20)); // ensure a distinct sold_at ordering
      const newerSale = await sell(newer.variantId, 1);

      // Refunding the newer sale shouldn't make it disappear from "recent"
      // (it was still a real, recent sale) — but a *pure refund-only*
      // product with no real sale should never show up at all, which the
      // WHERE clause on sale.refund_of_sale_id guarantees structurally.
      await app.inject({
        method: 'POST',
        url: `/sales/${newerSale.json().id}/refund`,
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          id: generateId(),
          lines: [{ saleLineId: newerSale.json().lines[0].id, quantity: 1, restock: true }],
          method: 'CASH',
          reason: 'test',
        },
      });

      const res = await app.inject({ method: 'GET', url: '/products/recent', headers: { authorization: `Bearer ${cashierToken}` } });
      expect(res.statusCode).toBe(200);
      const ids = res.json().map((p: { id: string }) => p.id);
      expect(ids.indexOf(newer.variantId)).toBeLessThan(ids.indexOf(older.variantId));
    });
  });
});
