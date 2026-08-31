import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

describe('onboarding (T-30)', () => {
  let app: FastifyInstance;

  async function makeLocationWithOwner(label: string) {
    const locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: label, currency: 'GHS' } });
    const runSuffix = generateId();
    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: `${label} Owner`,
        email: `${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('onboarding-test-password'),
        role: 'OWNER',
        locationId,
      },
    });
    const token = (
      await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'onboarding-test-password' } })
    ).json().accessToken;
    return { locationId, ownerId, token };
  }

  async function makeCashier(locationId: string) {
    const runSuffix = generateId();
    await app.prisma.user.create({
      data: {
        id: generateId(),
        name: 'Onboarding Cashier',
        email: `${runSuffix}@test.surestock.local`,
        passwordHash: await hashPassword('onboarding-cashier-password'),
        role: 'CASHIER',
        locationId,
      },
    });
    return (await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: `${runSuffix}@test.surestock.local`, password: 'onboarding-cashier-password' } })).json()
      .accessToken;
  }

  function stepByKey(body: { steps: Array<{ key: string; done: boolean; required: boolean }> }, key: string) {
    return body.steps.find((s) => s.key === key);
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('only the Owner can reach onboarding status, not Manager or Cashier', async () => {
    const { locationId, token: ownerToken } = await makeLocationWithOwner('Onboarding Gate Shop');
    const cashierToken = await makeCashier(locationId);

    const asOwner = await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(asOwner.statusCode).toBe(200);
    const asCashier = await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(asCashier.statusCode).toBe(403);
  });

  it('a brand-new shop has nothing set up, and each step turns on as the real underlying data appears', async () => {
    const { locationId, token } = await makeLocationWithOwner('Onboarding Fresh Shop');

    const fresh = (await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${token}` } })).json();
    expect(fresh.isComplete).toBe(false);
    expect(stepByKey(fresh, 'SHOP_PROFILE')?.done).toBe(false);
    expect(stepByKey(fresh, 'PRODUCTS')?.done).toBe(false);
    expect(stepByKey(fresh, 'OPENING_STOCK')?.done).toBe(false);
    expect(stepByKey(fresh, 'INVITE_STAFF')?.done).toBe(false);
    expect(stepByKey(fresh, 'HARDWARE_TEST')?.done).toBe(false); // never derivable — always shown, never gates completion
    expect(stepByKey(fresh, 'HARDWARE_TEST')?.required).toBe(false);

    await app.inject({
      method: 'PATCH',
      url: '/settings/business',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'onboarding-fresh-shop@test.surestock.local' },
    });
    const afterProfile = (await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${token}` } })).json();
    expect(stepByKey(afterProfile, 'SHOP_PROFILE')?.done).toBe(true);

    // A product added with zero opening quantity turns on PRODUCTS but not OPENING_STOCK yet.
    await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'No Stock Yet', variants: [{ sku: `ONB-NOSTOCK-${generateId()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: 0 }] },
    });
    const afterEmptyProduct = (await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${token}` } })).json();
    expect(stepByKey(afterEmptyProduct, 'PRODUCTS')?.done).toBe(true);
    expect(stepByKey(afterEmptyProduct, 'OPENING_STOCK')?.done).toBe(false);

    // A real opening quantity turns on OPENING_STOCK too.
    await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Has Real Stock', variants: [{ sku: `ONB-STOCK-${generateId()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: 10 }] },
    });
    const afterStockedProduct = (await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${token}` } })).json();
    expect(stepByKey(afterStockedProduct, 'OPENING_STOCK')?.done).toBe(true);

    await makeCashier(locationId);
    const afterStaff = (await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${token}` } })).json();
    expect(stepByKey(afterStaff, 'INVITE_STAFF')?.done).toBe(true);

    // Every required step is now real — the checklist can finally clear.
    expect(afterStaff.isComplete).toBe(true);
  });

  it("PRODUCTS and OPENING_STOCK are scoped to this location's own variants, not the whole database", async () => {
    const other = await makeLocationWithOwner('Onboarding Other Shop');
    await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${other.token}` },
      payload: { name: 'Other Shop Product', variants: [{ sku: `ONB-OTHER-${generateId()}`, costPrice: 400, sellingPrice: 1000, openingQuantity: 50 }] },
    });

    const { token } = await makeLocationWithOwner('Onboarding Isolated Shop');
    const status = (await app.inject({ method: 'GET', url: '/onboarding/status', headers: { authorization: `Bearer ${token}` } })).json();
    expect(stepByKey(status, 'PRODUCTS')?.done).toBe(false);
    expect(stepByKey(status, 'OPENING_STOCK')?.done).toBe(false);
  });
});
