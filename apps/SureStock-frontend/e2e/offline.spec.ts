import { test, expect } from '@playwright/test';
import { registerShop, createProduct, loginViaUI, openTillShift } from './fixtures';

const API_BASE = 'http://localhost:4000';

/**
 * T-32: "offline scenarios scripted." Playwright's `context.setOffline`
 * is a real network-level condition (unlike patching `navigator.onLine`
 * by hand in earlier manual verification, which never actually blocked
 * requests) — the first time this exact scenario has been driven by a
 * stable, scriptable tool. It caught two real bugs this way: see
 * ProductSearch.tsx's two `networkMode: 'always'` fixes — TanStack
 * Query's default `networkMode: 'online'` pauses ANY query (including
 * one that reads only the local Dexie cache and touches no network at
 * all) the moment the browser reports itself offline, so neither the
 * live search nor its own offline fallback ever actually ran under a
 * real offline condition before this.
 */
test('a sale charged while offline queues locally, shows a real receipt, and syncs on reconnect', async ({ page, context, request }) => {
  const shop = await registerShop(request, 'Offline');
  const product = await createProduct(request, shop.accessToken, { name: 'E2E Offline Widget', sellingPrice: 1200, costPrice: 500, openingQuantity: 10 });
  await openTillShift(request, shop.accessToken, 0);

  await loginViaUI(page, shop.email, shop.password);
  await page.goto('/');
  await expect(page.getByText('Online').first()).toBeVisible();

  // useOfflineSync's initial catalogue refresh (catalogue-cache.ts) is
  // fire-and-forget on mount — nothing in the UI signals "the Dexie
  // cache is now populated." Poll the real IndexedDB store directly so
  // the test doesn't go offline before the product this spec just
  // created has actually landed in the local cache it depends on.
  await page.waitForFunction(
    (sku) =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('surestock-offline');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('variants')) {
            resolve(false);
            return;
          }
          const getReq = db.transaction('variants', 'readonly').objectStore('variants').index('sku').get(sku);
          getReq.onsuccess = () => resolve(Boolean(getReq.result));
          getReq.onerror = () => resolve(false);
        };
      }),
    product.sku,
    { timeout: 15_000 },
  );

  await context.setOffline(true);
  await expect(page.getByText('Offline').first()).toBeVisible();

  await page.getByPlaceholder('Search by product name, SKU or scan barcode…').fill('E2E Offline Widget');
  await page.locator('button', { hasText: 'E2E Offline Widget' }).first().click();
  await page.getByRole('button', { name: /^Charge GH/ }).first().click();
  await page.getByRole('button', { name: /^Charge GH/ }).last().click();

  // The receipt renders immediately, offline, with the real deterministic receipt number — no round trip to the server needed.
  await expect(page.getByRole('button', { name: 'New sale' })).toBeVisible();
  await expect(page.getByText(/RCT-/)).toBeVisible();
  await expect(page.getByText(/waiting to sync/).first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/waiting to sync/).first()).not.toBeVisible({ timeout: 15_000 });

  const sales = await request.get(`${API_BASE}/sales`, { headers: { Authorization: `Bearer ${shop.accessToken}` } });
  const salesBody = await sales.json();
  expect(salesBody.items).toHaveLength(1);
  expect(salesBody.items[0].total).toBe(1200);
});
