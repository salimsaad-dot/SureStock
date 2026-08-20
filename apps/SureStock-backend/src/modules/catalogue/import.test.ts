import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { buildApp } from '../../app.js';
import { generateId } from '../../lib/id.js';
import { hashPassword } from '../auth/service.js';
import { buildMultipartFile } from '../../test/multipart.js';
import type { ImportMapping } from './import.schemas.js';

describe('product import (spreadsheet)', () => {
  let app: FastifyInstance;
  let locationId: string;
  let ownerToken: string;
  let cashierToken: string;
  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  let marker: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    // Sliced from the end, not the start: a UUIDv7's leading characters
    // are a millisecond timestamp, not random data, so two test runs
    // moments apart (or even a minute apart) can share the same prefix —
    // confirmed the hard way when a second run collided with the first.
    // The trailing characters are the actual random bits.
    marker = generateId().slice(-8);

    locationId = generateId();
    await app.prisma.location.create({ data: { id: locationId, name: 'Import Test Shop', currency: 'GHS' } });

    const ownerId = generateId();
    const ownerEmail = `import-owner-${generateId()}@test.surestock.local`;
    await app.prisma.user.create({
      data: { id: ownerId, name: 'Import Owner', email: ownerEmail, passwordHash: await hashPassword('import-owner-pw'), role: 'OWNER', locationId },
    });
    const cashierId = generateId();
    const cashierEmail = `import-cashier-${generateId()}@test.surestock.local`;
    await app.prisma.user.create({
      data: { id: cashierId, name: 'Import Cashier', email: cashierEmail, passwordHash: await hashPassword('import-cashier-pw'), role: 'CASHIER', locationId },
    });
    createdUserIds.push(ownerId, cashierId);

    ownerToken = (await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: ownerEmail, password: 'import-owner-pw' } })).json().accessToken;
    cashierToken = (await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: cashierEmail, password: 'import-cashier-pw' } })).json().accessToken;
  });

  afterAll(async () => {
    const productIds = createdProductIds.filter((id): id is string => Boolean(id));
    await app.prisma.productVariant.deleteMany({ where: { productId: { in: productIds }, stockMovements: { none: {} } } });
    await app.prisma.product.deleteMany({ where: { id: { in: productIds }, variants: { none: {} } } });
    for (const id of createdUserIds) {
      await app.prisma.user.delete({ where: { id } }).catch(() => {});
    }
    await app.close();
  });

  const STANDARD_MAPPING: ImportMapping = {
    name: 'Name',
    sku: 'SKU',
    costPrice: 'Cost Price',
    sellingPrice: 'Selling Price',
    barcode: 'Barcode',
    unit: 'Unit',
    reorderPoint: 'Reorder Point',
    openingQuantity: 'Opening Quantity',
  };
  const HEADERS = ['Name', 'SKU', 'Cost Price', 'Selling Price', 'Barcode', 'Unit', 'Reorder Point', 'Opening Quantity'];

  it('downloads a template whose headers match the mappable fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/import/template', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.payload).toContain('Name');
    expect(res.payload).toContain('SKU');
  });

  it('a cashier cannot access any import endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/products/import/template', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(res.statusCode).toBe(403);
  });

  it('parses an uploaded CSV and suggests a column mapping', async () => {
    const csv = `Product Name,SKU,Cost,Price\nTest Import Product ${marker},IMP-${marker}-1,5.00,9.00\n`;
    const { body, contentTypeHeader } = buildMultipartFile('file', 'products.csv', 'text/csv', Buffer.from(csv));

    const res = await app.inject({
      method: 'POST',
      url: '/products/import/parse',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentTypeHeader },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const parsed = res.json();
    expect(parsed.headers).toEqual(['Product Name', 'SKU', 'Cost', 'Price']);
    expect(parsed.rows).toEqual([[`Test Import Product ${marker}`, `IMP-${marker}-1`, '5.00', '9.00']]);
    // Fuzzy-suggested even though headers don't match the field names exactly.
    expect(parsed.suggestedMapping.name).toBe('Product Name');
    expect(parsed.suggestedMapping.sku).toBe('SKU');
  });

  it('parses an uploaded XLSX file identically to CSV', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(['Name', 'SKU', 'Cost Price', 'Selling Price']);
    sheet.addRow([`XLSX Import Product ${marker}`, `IMP-XLSX-${marker}`, 4.5, 8]);
    const xlsxBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const { body, contentTypeHeader } = buildMultipartFile(
      'file',
      'products.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xlsxBuffer,
    );
    const res = await app.inject({
      method: 'POST',
      url: '/products/import/parse',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': contentTypeHeader },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toEqual([[`XLSX Import Product ${marker}`, `IMP-XLSX-${marker}`, '4.5', '8']]);
  });

  it('preview lists valid and invalid rows with reasons, without writing anything', async () => {
    const rows = [
      [`Valid Product ${marker}`, `IMP-VALID-${marker}`, '5.00', '9.00', '', 'EACH', '', ''],
      ['', `IMP-NONAME-${marker}`, '5.00', '9.00', '', '', '', ''], // missing name
      [`Bad Price Product ${marker}`, `IMP-BADPRICE-${marker}`, 'not-a-number', '9.00', '', '', '', ''],
      [`Dup Sku A ${marker}`, `IMP-DUPE-${marker}`, '5.00', '9.00', '', '', '', ''],
      [`Dup Sku B ${marker}`, `IMP-DUPE-${marker}`, '5.00', '9.00', '', '', '', ''], // duplicate sku within file
    ];

    const res = await app.inject({
      method: 'POST',
      url: '/products/import/validate',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { headers: HEADERS, rows, mapping: STANDARD_MAPPING },
    });
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.totalRows).toBe(5);
    expect(report.validCount).toBe(2); // row 1 and the first of the two duplicate-SKU rows
    expect(report.invalidCount).toBe(3);
    expect(report.rows[1].status).toBe('invalid');
    expect(report.rows[1].reasons[0]).toMatch(/name is required/i);
    expect(report.rows[2].reasons[0]).toMatch(/not a valid amount/i);
    expect(report.rows[4].reasons[0]).toMatch(/duplicated in this file/i);

    const stillNoProducts = await app.prisma.product.count({ where: { name: { contains: marker } } });
    expect(stillNoProducts).toBe(0);
  });

  it('commit is all-or-nothing: any invalid row means nothing is written', async () => {
    const rows = [
      [`AllOrNothing Good ${marker}`, `IMP-AON-GOOD-${marker}`, '5.00', '9.00', '', '', '', ''],
      [`AllOrNothing Bad ${marker}`, `IMP-AON-BAD-${marker}`, 'garbage', '9.00', '', '', '', ''],
    ];
    const res = await app.inject({
      method: 'POST',
      url: '/products/import/commit',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { headers: HEADERS, rows, mapping: STANDARD_MAPPING },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().committed).toBe(false);

    const count = await app.prisma.product.count({ where: { name: { contains: `AllOrNothing` } } });
    expect(count).toBe(0);
  });

  it('a fully valid file commits, resolves category by name, and posts opening stock as a real movement', async () => {
    const category = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: `Import Category ${marker}` },
    });
    const categoryId = category.json().id;

    const mapping: ImportMapping = { ...STANDARD_MAPPING, categoryName: 'Category' };
    const headers = [...HEADERS, 'Category'];
    const rows = [[`Commit Product ${marker}`, `IMP-COMMIT-${marker}`, '6.00', '11.00', '', '', '', '8', `Import Category ${marker}`]];

    const res = await app.inject({
      method: 'POST',
      url: '/products/import/commit',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { headers, rows, mapping },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ committed: true, productsCreated: 1 });

    const product = await app.prisma.product.findFirst({
      where: { name: `Commit Product ${marker}` },
      include: { variants: true },
    });
    expect(product?.categoryId).toBe(categoryId);
    createdProductIds.push(product!.id);

    const variant = product!.variants[0]!;
    expect(variant.quantityOnHand.toNumber()).toBe(8);
    const movement = await app.prisma.stockMovement.findFirst({ where: { variantId: variant.id } });
    expect(movement).toMatchObject({ reason: 'OPENING_BALANCE' });

    await app.prisma.category.delete({ where: { id: categoryId } }).catch(() => {});
  });

  it(
    'imports 1,000 rows well within 30 seconds (Doc 6, T-08)',
    async () => {
      const headers = ['Name', 'SKU', 'Cost Price', 'Selling Price'];
      const mapping: ImportMapping = { name: 'Name', sku: 'SKU', costPrice: 'Cost Price', sellingPrice: 'Selling Price' };
      const rows = Array.from({ length: 1000 }, (_, i) => [`Bulk Import ${marker} ${i}`, `IMP-BULK-${marker}-${i}`, '3.50', '6.00']);

      const start = performance.now();
      const res = await app.inject({
        method: 'POST',
        url: '/products/import/commit',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { headers, rows, mapping },
      });
      const elapsedMs = performance.now() - start;

      expect(res.statusCode).toBe(201);
      expect(res.json().productsCreated).toBe(1000);
      expect(elapsedMs).toBeLessThan(30_000);

      const created = await app.prisma.product.findMany({ where: { name: { contains: `Bulk Import ${marker}` } }, select: { id: true } });
      createdProductIds.push(...created.map((p) => p.id));
    },
    35_000,
  );
});
