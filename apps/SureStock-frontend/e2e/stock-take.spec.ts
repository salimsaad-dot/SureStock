import { test, expect } from '@playwright/test';
import { registerShop, createProduct, loginViaUI } from './fixtures';

/**
 * T-32: "...and stock take" — start a full-shop count, enter a count
 * that matches the known opening quantity exactly (no discrepancy, so
 * the review screen needs no reason text — this spec is about proving
 * the real start → count → review → post chain, not re-testing T-27's
 * own discrepancy-reason validation, already covered by the backend
 * integration tests).
 */
test('a manager can run a full stock take end to end with no discrepancies', async ({ page, request }) => {
  const shop = await registerShop(request, 'StockTake');
  await createProduct(request, shop.accessToken, { name: 'E2E Stock Take Widget', sellingPrice: 1000, costPrice: 400, openingQuantity: 7 });

  await loginViaUI(page, shop.email, shop.password);
  await page.goto('/inventory/stock-take');

  await page.getByRole('button', { name: 'Start counting' }).click();
  await expect(page.getByText('E2E Stock Take Widget')).toBeVisible();

  await page.getByRole('button', { name: '7', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Every item has been counted.')).toBeVisible();
  await page.getByRole('button', { name: 'Review & post' }).click();

  await expect(page.getByText('No discrepancies — every counted item matched the system.')).toBeVisible();
  await page.getByRole('button', { name: 'Post adjustments' }).click();

  await expect(page.getByText(/posted|permanent/i).first()).toBeVisible({ timeout: 10_000 });
});
