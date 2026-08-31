import type { APIRequestContext, Page } from '@playwright/test';

const API_BASE = 'http://localhost:4000';

export interface RegisteredShop {
  shopName: string;
  email: string;
  password: string;
  accessToken: string;
  locationId: string;
}

/** Registers a real, isolated shop for one spec run via the actual T-30 endpoint — no shared fixture to collide with another spec or a prior session's smoke data. */
export async function registerShop(request: APIRequestContext, label: string): Promise<RegisteredShop> {
  const unique = `${label}-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const email = `e2e-${unique}@test.surestock.local`;
  const password = 'e2e-test-password-123';

  const res = await request.post(`${API_BASE}/auth/register`, {
    data: { shopName: `E2E ${label} Shop`, ownerName: `E2E ${label} Owner`, email, password },
  });
  if (!res.ok()) throw new Error(`registerShop failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();

  return { shopName: `E2E ${label} Shop`, email, password, accessToken: body.accessToken, locationId: body.user.locationId };
}

export interface SeededProduct {
  productId: string;
  variantId: string;
  sku: string;
}

export async function createProduct(
  request: APIRequestContext,
  accessToken: string,
  opts: { name: string; sellingPrice: number; costPrice: number; openingQuantity: number },
): Promise<SeededProduct> {
  const sku = `E2E-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const res = await request.post(`${API_BASE}/products`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: opts.name, variants: [{ sku, costPrice: opts.costPrice, sellingPrice: opts.sellingPrice, openingQuantity: opts.openingQuantity }] },
  });
  if (!res.ok()) throw new Error(`createProduct failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return { productId: body.id, variantId: body.variants[0].id, sku };
}

/** Real login through the actual UI form — not skipped, since T-32 covers real user flows, not just API setup. */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Phone or email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/dashboard');
}

/** Every UI-driven sale flow needs an open till shift first (T-20's own gate) — opened directly via the API so each spec's real assertions stay focused on what it's actually testing. */
export async function openTillShift(request: APIRequestContext, accessToken: string, openingFloat = 0): Promise<void> {
  const res = await request.post(`${API_BASE}/till-shifts`, { headers: { Authorization: `Bearer ${accessToken}` }, data: { openingFloat } });
  if (!res.ok()) throw new Error(`openTillShift failed: ${res.status()} ${await res.text()}`);
}
