import { test, expect } from '@playwright/test';
import { registerShop, createProduct, loginViaUI, openTillShift } from './fixtures';

const API_BASE = 'http://localhost:4000';

/** T-32: "...refund..." — a real completed sale, then a real restock refund through the actual UI, not the API. */
test('a manager can refund a sale and stock is restored', async ({ page, request }) => {
  const shop = await registerShop(request, 'Refund');
  const product = await createProduct(request, shop.accessToken, { name: 'E2E Refund Widget', sellingPrice: 1000, costPrice: 400, openingQuantity: 10 });
  await openTillShift(request, shop.accessToken, 0);

  // The sale itself is already covered end to end by sale.spec.ts — seeded directly here so this spec's UI assertions stay focused on the refund flow.
  const saleId = crypto.randomUUID();
  const sale = await request.post(`${API_BASE}/sales`, {
    headers: { Authorization: `Bearer ${shop.accessToken}` },
    data: { id: saleId, lines: [{ variantId: product.variantId, quantity: 2 }], payments: [{ method: 'CASH', amount: 2000 }] },
  });
  expect(sale.ok()).toBe(true);

  await loginViaUI(page, shop.email, shop.password);
  await page.goto(`/sales/${saleId}`);

  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  await page.getByRole('button', { name: 'Increase refund quantity for E2E Refund Widget' }).click();
  await page.getByLabel('Reason').fill('E2E test refund');
  await page.getByRole('button', { name: 'Confirm refund' }).click();

  // Not a text match on "Refund" — the still-open dialog's own heading
  // ("Refund {receiptNumber}") already matches that before the mutation
  // resolves, which would make the assertion pass instantly instead of
  // waiting for the real result. The success toast text is unique to
  // an actual completed refund (SaleDetailPage's handleRefundSuccess).
  await expect(page.getByText('Refund complete.')).toBeVisible({ timeout: 10_000 });

  const restockedVariant = await request.get(`${API_BASE}/products/${product.productId}`, { headers: { Authorization: `Bearer ${shop.accessToken}` } });
  const productBody = await restockedVariant.json();
  expect(productBody.variants[0].quantityOnHand).toBe(9); // 10 opening - 2 sold + 1 restocked
});
