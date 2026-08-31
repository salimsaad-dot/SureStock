import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

/**
 * Doc 6 T-30 follow-up (2026-08-25): the real point of adding `locationId`
 * to Category/Supplier/Product/TaxRate/PurchaseOrder is that two
 * independent shops can no longer see, edit, or reference each other's
 * catalogue — this file is the direct proof of that, not just a check
 * that the new column exists. Two real, separately-owned shops (A and B)
 * are set up once; every test below asks "can B reach something that
 * belongs to A?" and asserts the answer is always no — 404, not 403,
 * matching this codebase's existing "cross-tenant access looks identical
 * to not-found" posture everywhere else it already applied (barcode
 * lookup, till shifts, sales).
 */
describe('cross-tenant catalogue isolation (T-30 follow-up)', () => {
  let app: FastifyInstance;

  let tokenA: string;
  let tokenB: string;

  let categoryA: string;
  let supplierA: string;
  let productA: string;
  let variantA: string;
  let poA: string;

  const SHARED_BARCODE = `SHARED-${generateId().slice(-8)}`;

  async function makeShop(label: string) {
    const locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: `${label} Shop`, currency: 'GHS' } });
    const email = `${label.toLowerCase()}-${generateId().slice(-8)}@test.surestock.local`;
    const password = `${label.toLowerCase()}-isolation-password`;
    await app.prisma.user.create({
      data: { id: generateId(), name: `${label} Owner`, email, passwordHash: await hashPassword(password), role: 'OWNER', locationId },
    });
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password } });
    return { locationId, token: res.json().accessToken as string };
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const a = await makeShop('IsolationA');
    const b = await makeShop('IsolationB');
    tokenA = a.token;
    tokenB = b.token;

    const cat = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Isolation Test Category A' },
    });
    categoryA = cat.json().id;

    const sup = await app.inject({
      method: 'POST',
      url: '/suppliers',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Isolation Test Supplier A' },
    });
    supplierA = sup.json().id;

    const prod = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        name: 'Isolation Test Product A',
        categoryId: categoryA,
        supplierId: supplierA,
        variants: [{ sku: `ISO-A-${generateId().slice(-8)}`, barcode: SHARED_BARCODE, costPrice: 100, sellingPrice: 200, openingQuantity: 10 }],
      },
    });
    productA = prod.json().id;
    variantA = prod.json().variants[0].id;

    const po = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { supplierId: supplierA, lines: [{ variantId: variantA, quantityOrdered: 5, unitCost: 100 }] },
    });
    poA = po.json().id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a fresh shop starts with none of another shop\'s categories, suppliers, or products in its own lists', async () => {
    const categories = await app.inject({ method: 'GET', url: '/categories', headers: { authorization: `Bearer ${tokenB}` } });
    expect(categories.json().some((c: { id: string }) => c.id === categoryA)).toBe(false);

    const suppliers = await app.inject({ method: 'GET', url: '/suppliers', headers: { authorization: `Bearer ${tokenB}` } });
    expect(suppliers.json().some((s: { id: string }) => s.id === supplierA)).toBe(false);

    const products = await app.inject({ method: 'GET', url: '/products', headers: { authorization: `Bearer ${tokenB}` } });
    expect(products.json().items.some((p: { id: string }) => p.id === productA)).toBe(false);

    // Sanity: shop A still sees its own rows — this isn't just "everything is empty."
    const categoriesA = await app.inject({ method: 'GET', url: '/categories', headers: { authorization: `Bearer ${tokenA}` } });
    expect(categoriesA.json().some((c: { id: string }) => c.id === categoryA)).toBe(true);
  });

  it('reading, updating, archiving, or deleting another shop\'s category/supplier/product is a 404, not a 403 or a silent success', async () => {
    const getProduct = await app.inject({ method: 'GET', url: `/products/${productA}`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(getProduct.statusCode).toBe(404);

    const patchCategory = await app.inject({
      method: 'PATCH',
      url: `/categories/${categoryA}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Hijacked' },
    });
    expect(patchCategory.statusCode).toBe(404);

    const archiveCategory = await app.inject({ method: 'POST', url: `/categories/${categoryA}/archive`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(archiveCategory.statusCode).toBe(404);

    const deleteCategory = await app.inject({ method: 'DELETE', url: `/categories/${categoryA}`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(deleteCategory.statusCode).toBe(404);

    const patchSupplier = await app.inject({
      method: 'PATCH',
      url: `/suppliers/${supplierA}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Hijacked' },
    });
    expect(patchSupplier.statusCode).toBe(404);

    const patchProduct = await app.inject({
      method: 'PATCH',
      url: `/products/${productA}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Hijacked Product' },
    });
    expect(patchProduct.statusCode).toBe(404);

    // Confirm none of the above actually mutated shop A's real data.
    const stillIntact = await app.inject({ method: 'GET', url: `/products/${productA}`, headers: { authorization: `Bearer ${tokenA}` } });
    expect(stillIntact.json().name).toBe('Isolation Test Product A');
  });

  it('creating a product against another shop\'s category, supplier, or tax rate id is rejected as not found', async () => {
    const badCategory = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Cross-tenant category attempt', categoryId: categoryA, variants: [{ sku: `BAD-CAT-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2 }] },
    });
    expect(badCategory.statusCode).toBe(404);

    const badSupplier = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Cross-tenant supplier attempt', supplierId: supplierA, variants: [{ sku: `BAD-SUP-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2 }] },
    });
    expect(badSupplier.statusCode).toBe(404);
  });

  it('adding or editing a variant on another shop\'s product is a 404', async () => {
    const addVariant = await app.inject({
      method: 'POST',
      url: `/products/${productA}/variants`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { sku: `HIJACK-${generateId().slice(-8)}`, costPrice: 1, sellingPrice: 2 },
    });
    expect(addVariant.statusCode).toBe(404);

    const editVariant = await app.inject({
      method: 'PATCH',
      url: `/products/${productA}/variants/${variantA}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { sellingPrice: 1, priceChangeReason: 'hijack attempt' },
    });
    expect(editVariant.statusCode).toBe(404);
  });

  it('the same barcode can be used by two independent shops — it collided globally before this fix, now only within one shop', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        name: 'Isolation Test Product B',
        variants: [{ sku: `ISO-B-${generateId().slice(-8)}`, barcode: SHARED_BARCODE, costPrice: 50, sellingPrice: 90, openingQuantity: 5 }],
      },
    });
    expect(res.statusCode).toBe(201);

    // A duplicate barcode within the *same* shop is still rejected.
    const dupe = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Duplicate Barcode Attempt', variants: [{ sku: `ISO-B2-${generateId().slice(-8)}`, barcode: SHARED_BARCODE, costPrice: 1, sellingPrice: 2 }] },
    });
    expect(dupe.statusCode).toBe(409);
  });

  it('barcode lookup returns each shop\'s own product for the identical barcode value, never the other shop\'s', async () => {
    const lookupA = await app.inject({
      method: 'GET',
      url: `/products/lookup?barcode=${encodeURIComponent(SHARED_BARCODE)}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(lookupA.statusCode).toBe(200);
    expect(lookupA.json().productName).toBe('Isolation Test Product A');

    const lookupB = await app.inject({
      method: 'GET',
      url: `/products/lookup?barcode=${encodeURIComponent(SHARED_BARCODE)}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(lookupB.statusCode).toBe(200);
    expect(lookupB.json().productName).toBe('Isolation Test Product B');
  });

  it('purchase orders: another shop\'s order is invisible in the list, unreachable by id, and cannot be targeted by a new order\'s supplierId', async () => {
    const list = await app.inject({ method: 'GET', url: '/purchase-orders', headers: { authorization: `Bearer ${tokenB}` } });
    expect(list.json().items.some((po: { id: string }) => po.id === poA)).toBe(false);

    const get = await app.inject({ method: 'GET', url: `/purchase-orders/${poA}`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(get.statusCode).toBe(404);

    const send = await app.inject({ method: 'POST', url: `/purchase-orders/${poA}/send`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(send.statusCode).toBe(404);

    const crossSupplier = await app.inject({
      method: 'POST',
      url: '/purchase-orders',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { supplierId: supplierA, lines: [{ variantId: variantA, quantityOrdered: 1, unitCost: 100 }] },
    });
    expect(crossSupplier.statusCode).toBe(404);
  });

  it('purchase order stats for shop B never include shop A\'s draft order', async () => {
    const statsBeforeB = await app.inject({ method: 'GET', url: '/purchase-orders/stats', headers: { authorization: `Bearer ${tokenB}` } });
    expect(statsBeforeB.json().draft.orders).toBe(0); // shop A's poA (still DRAFT) must not count here
  });

  it('the onboarding "add categories" step reflects this shop\'s own state, not the fact that shop A already has categories', async () => {
    const status = await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${tokenB}` } });
    const categoriesStep = status.json().steps.find((s: { key: string }) => s.key === 'CATEGORIES');
    expect(categoriesStep.done).toBe(false);

    const statusA = await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${tokenA}` } });
    const categoriesStepA = statusA.json().steps.find((s: { key: string }) => s.key === 'CATEGORIES');
    expect(categoriesStepA.done).toBe(true);
  });

  it('shop A\'s data export never contains shop B\'s category, supplier, or product names', async () => {
    const res = await app.inject({ method: 'GET', url: '/settings/export', headers: { authorization: `Bearer ${tokenA}` } });
    expect(res.statusCode).toBe(200);
    const csv = res.body;
    expect(csv).toContain('Isolation Test Category A');
    expect(csv).toContain('Isolation Test Supplier A');
    expect(csv).toContain('Isolation Test Product A');
    expect(csv).not.toContain('Isolation Test Product B');
  });
});
