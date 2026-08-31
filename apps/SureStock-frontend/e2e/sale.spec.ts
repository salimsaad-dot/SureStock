import { test, expect } from '@playwright/test';
import { registerShop, createProduct, loginViaUI, openTillShift } from './fixtures';

const API_BASE = 'http://localhost:4000';

/** T-32: "Playwright covers sale..." — a real cashier flow: search, add to cart, charge, receipt. */
test('a cashier can complete a full sale end to end', async ({ page, request }) => {
  const shop = await registerShop(request, 'Sale');
  const product = await createProduct(request, shop.accessToken, { name: 'E2E Sale Widget', sellingPrice: 1500, costPrice: 600, openingQuantity: 20 });
  await openTillShift(request, shop.accessToken, 0);

  await loginViaUI(page, shop.email, shop.password);
  await page.goto('/');

  await page.getByPlaceholder('Search by product name, SKU or scan barcode…').fill('E2E Sale Widget');
  await page.locator('button', { hasText: 'E2E Sale Widget' }).first().click();

  // First click opens the payment sheet (CartPanel's own trigger); the sheet renders after it in the DOM, so its own submit button is the later match.
  await page.getByRole('button', { name: /^Charge GH/ }).first().click();
  await page.getByRole('button', { name: /^Charge GH/ }).last().click();

  await expect(page.getByRole('button', { name: 'New sale' })).toBeVisible();
  await expect(page.getByText(/RCT-/)).toBeVisible();

  // Confirmed through a second channel — the real database, via the API — not just the UI's own claim.
  const sales = await request.get(`${API_BASE}/sales`, { headers: { Authorization: `Bearer ${shop.accessToken}` } });
  const salesBody = await sales.json();
  expect(salesBody.items).toHaveLength(1);
  expect(salesBody.items[0].total).toBe(1500);

  const updatedVariant = await request.get(`${API_BASE}/products/${product.productId}`, { headers: { Authorization: `Bearer ${shop.accessToken}` } });
  const productBody = await updatedVariant.json();
  expect(productBody.variants[0].quantityOnHand).toBe(19);
});
