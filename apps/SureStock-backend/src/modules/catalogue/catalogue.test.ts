import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';

const OWNER_PASSWORD = 'owner-password-catalogue-test';
const MANAGER_PASSWORD = 'manager-password-catalogue-test';
const CASHIER_PASSWORD = 'cashier-password-catalogue-test';

describe('catalogue routes (categories and suppliers)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let managerToken: string;
  let cashierToken: string;

  const createdCategoryIds: string[] = [];
  const createdSupplierIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdUserIds: string[] = [];

  async function tokenFor(identifier: string, password: string) {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier, password } });
    return res.json().accessToken as string;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Catalogue Test Shop', currency: 'GHS' } });

    const ownerId = generateId();
    await app.prisma.user.create({
      data: {
        id: ownerId,
        name: 'Catalogue Owner',
        email: 'catalogue-owner@test.surestock.local',
        passwordHash: await hashPassword(OWNER_PASSWORD),
        role: 'OWNER',
        locationId,
      },
    });
    const managerId = generateId();
    await app.prisma.user.create({
      data: {
        id: managerId,
        name: 'Catalogue Manager',
        email: 'catalogue-manager@test.surestock.local',
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        role: 'MANAGER',
        locationId,
      },
    });
    const cashierId = generateId();
    await app.prisma.user.create({
      data: {
        id: cashierId,
        name: 'Catalogue Cashier',
        email: 'catalogue-cashier@test.surestock.local',
        passwordHash: await hashPassword(CASHIER_PASSWORD),
        role: 'CASHIER',
        locationId,
      },
    });
    createdUserIds.push(ownerId, managerId, cashierId);

    ownerToken = await tokenFor('catalogue-owner@test.surestock.local', OWNER_PASSWORD);
    managerToken = await tokenFor('catalogue-manager@test.surestock.local', MANAGER_PASSWORD);
    cashierToken = await tokenFor('catalogue-cashier@test.surestock.local', CASHIER_PASSWORD);
  });

  afterAll(async () => {
    // Scoped to exactly the rows this file created — a broader match
    // (e.g. by email domain) risks deleting another test file's
    // still-in-use fixtures, since Vitest runs separate files
    // concurrently against the same test database by default.
    await app.prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await app.prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await app.prisma.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
    await app.prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.prisma.location.delete({ where: { id: locationId } });
    await app.close();
  });

  describe('categories', () => {
    it('a cashier cannot create a category, but a manager can', async () => {
      const asCashier = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: { name: 'Beverages' },
      });
      expect(asCashier.statusCode).toBe(403);

      const asManager = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { name: 'Beverages' },
      });
      expect(asManager.statusCode).toBe(201);
      createdCategoryIds.push(asManager.json().id);
    });

    it('a cashier can still list categories (needed for the Sell screen filter chips)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/categories',
        headers: { authorization: `Bearer ${cashierToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it('nests a category under a parent, and rejects a parent that would create a cycle', async () => {
      const parent = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Dry goods' },
      });
      const parentId = parent.json().id;
      createdCategoryIds.push(parentId);

      const child = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Rice and grains', parentId },
      });
      expect(child.statusCode).toBe(201);
      const childId = child.json().id;
      createdCategoryIds.push(childId);
      expect(child.json().parentId).toBe(parentId);

      // Cycle: make the parent a child of its own child.
      const cyclic = await app.inject({
        method: 'PATCH',
        url: `/categories/${parentId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { parentId: childId },
      });
      expect(cyclic.statusCode).toBe(409);
    });

    it('archive hides a category from the default list but restore brings it back', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Seasonal (test)' },
      });
      const id = created.json().id;
      createdCategoryIds.push(id);

      await app.inject({
        method: 'POST',
        url: `/categories/${id}/archive`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      const defaultList = await app.inject({
        method: 'GET',
        url: '/categories',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(defaultList.json().some((c: { id: string }) => c.id === id)).toBe(false);

      const includingArchived = await app.inject({
        method: 'GET',
        url: '/categories?includeArchived=true',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(includingArchived.json().some((c: { id: string }) => c.id === id)).toBe(true);

      await app.inject({
        method: 'POST',
        url: `/categories/${id}/restore`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const afterRestore = await app.inject({
        method: 'GET',
        url: '/categories',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(afterRestore.json().some((c: { id: string }) => c.id === id)).toBe(true);
    });

    it('blocks deleting a category that a product references, but a manager cannot delete at all (Owner-only)', async () => {
      const category = await app.inject({
        method: 'POST',
        url: '/categories',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'In-use category (test)' },
      });
      const categoryId = category.json().id;
      createdCategoryIds.push(categoryId);

      const productId = generateId();
      await app.prisma.product.create({
        data: { id: productId, name: 'Test Product For Category Lock', unit: 'EACH', categoryId },
      });
      createdProductIds.push(productId);

      const asManager = await app.inject({
        method: 'DELETE',
        url: `/categories/${categoryId}`,
        headers: { authorization: `Bearer ${managerToken}` },
      });
      expect(asManager.statusCode).toBe(403);

      const asOwnerWhileInUse = await app.inject({
        method: 'DELETE',
        url: `/categories/${categoryId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(asOwnerWhileInUse.statusCode).toBe(409);

      await app.prisma.product.delete({ where: { id: productId } });
      createdProductIds.splice(createdProductIds.indexOf(productId), 1);

      const asOwnerAfterFreed = await app.inject({
        method: 'DELETE',
        url: `/categories/${categoryId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(asOwnerAfterFreed.statusCode).toBe(204);
      createdCategoryIds.splice(createdCategoryIds.indexOf(categoryId), 1);
    });
  });

  describe('suppliers', () => {
    it('a cashier cannot even list suppliers', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/suppliers',
        headers: { authorization: `Bearer ${cashierToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('stores lead time and payment terms, per Doc 6 T-05', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/suppliers',
        headers: { authorization: `Bearer ${managerToken}` },
        payload: { name: 'Kofi Wholesale Ltd', leadTimeDays: 3, paymentTerms: 'net 14' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ name: 'Kofi Wholesale Ltd', leadTimeDays: 3, paymentTerms: 'net 14' });
      createdSupplierIds.push(res.json().id);
    });

    it('blocks deleting a supplier referenced by a product', async () => {
      const supplier = await app.inject({
        method: 'POST',
        url: '/suppliers',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'In-use Supplier (test)' },
      });
      const supplierId = supplier.json().id;
      createdSupplierIds.push(supplierId);

      const productId = generateId();
      await app.prisma.product.create({
        data: { id: productId, name: 'Test Product For Supplier Lock', unit: 'EACH', supplierId },
      });
      createdProductIds.push(productId);

      const blocked = await app.inject({
        method: 'DELETE',
        url: `/suppliers/${supplierId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(blocked.statusCode).toBe(409);

      await app.prisma.product.delete({ where: { id: productId } });
      createdProductIds.splice(createdProductIds.indexOf(productId), 1);

      const freed = await app.inject({
        method: 'DELETE',
        url: `/suppliers/${supplierId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(freed.statusCode).toBe(204);
      createdSupplierIds.splice(createdSupplierIds.indexOf(supplierId), 1);
    });
  });
});
