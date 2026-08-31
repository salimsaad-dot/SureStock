import { test, expect } from '@playwright/test';
import { registerShop, createProduct, loginViaUI } from './fixtures';

const API_BASE = 'http://localhost:4000';

/** T-32: "...receive..." — a real purchase order, sent, then received through the actual ReceivePurchaseOrderDialog. */
test('receiving a sent purchase order increases real stock', async ({ page, request }) => {
  const shop = await registerShop(request, 'Receive');
  const product = await createProduct(request, shop.accessToken, { name: 'E2E Receive Widget', sellingPrice: 1000, costPrice: 400, openingQuantity: 0 });

  const supplier = await request.post(`${API_BASE}/suppliers`, {
    headers: { Authorization: `Bearer ${shop.accessToken}` },
    data: { name: 'E2E Receive Supplier' },
  });
  const supplierId = (await supplier.json()).id;

  const po = await request.post(`${API_BASE}/purchase-orders`, {
    headers: { Authorization: `Bearer ${shop.accessToken}` },
    data: { supplierId, lines: [{ variantId: product.variantId, quantityOrdered: 15, unitCost: 500 }] },
  });
  const poId = (await po.json()).id;
  const sendRes = await request.post(`${API_BASE}/purchase-orders/${poId}/send`, { headers: { Authorization: `Bearer ${shop.accessToken}` } });
  expect(sendRes.ok()).toBe(true);

  await loginViaUI(page, shop.email, shop.password);
  await page.goto(`/purchasing/${poId}`);

  await page.getByRole('button', { name: 'Receive stock' }).click();
  // The dialog prefills the full outstanding quantity (15) — confirming as-is is the real "receive everything ordered" path.
  await page.getByRole('button', { name: 'Confirm receipt' }).click();

  // Not a text match on "RECEIVED"/"Received" — the line table's own
  // "Received" column header is already on the page before this action
  // even runs, which would make that assertion pass instantly and
  // never actually wait for the real mutation. "Receive stock" only
  // disappears once the PO's status is no longer SENT/PARTIAL.
  await expect(page.getByRole('button', { name: 'Receive stock' })).not.toBeVisible({ timeout: 10_000 });

  const updatedVariant = await request.get(`${API_BASE}/products/${product.productId}`, { headers: { Authorization: `Bearer ${shop.accessToken}` } });
  const productBody = await updatedVariant.json();
  expect(productBody.variants[0].quantityOnHand).toBe(15);
});
