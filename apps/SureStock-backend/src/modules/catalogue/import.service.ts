import type { UnitOfMeasure } from '@prisma/client';
import type { prisma as PrismaClient } from '../../lib/prisma.js';
import { generateId } from '../../lib/id.js';
import { toDecimal, parseCedisToPesewas } from '../../lib/money.js';
import { HttpError } from '../../lib/http-error.js';
import { matchScore } from './search.js';
import { IMPORT_FIELDS, type ImportField, type ImportMapping } from './import.schemas.js';

const FIELD_ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'product name', 'product', 'item name'],
  sku: ['sku', 'code', 'item code', 'product code'],
  costPrice: ['cost', 'cost price', 'unit cost', 'buying price'],
  sellingPrice: ['price', 'selling price', 'sale price', 'retail price', 'unit price'],
  barcode: ['barcode', 'upc', 'ean', 'bar code'],
  variantName: ['variant', 'variant name', 'size', 'option'],
  categoryName: ['category'],
  supplierName: ['supplier', 'vendor'],
  unit: ['unit', 'uom', 'unit of measure'],
  reorderPoint: ['reorder point', 'reorder level', 'min stock', 'minimum stock'],
  reorderQuantity: ['reorder quantity', 'reorder qty'],
  openingQuantity: ['opening quantity', 'opening stock', 'initial stock', 'quantity', 'qty'],
  isPerishable: ['perishable'],
  description: ['description', 'notes', 'details'],
};

const UNITS: readonly string[] = ['EACH', 'KG', 'LITRE', 'PACK', 'METRE'];

/**
 * A best-effort guess at which uploaded column is which field, so a
 * spreadsheet whose headers already read "Product Name, SKU, Cost,
 * Price..." doesn't make the user map every column by hand — Doc 3 §2
 * still has them confirm it, this just gives them a head start. Greedy,
 * not an optimal assignment: processes required fields first so a
 * marginal match doesn't steal a header a required field needed more.
 */
export function suggestMapping(headers: string[]): Partial<ImportMapping> {
  const claimed = new Set<string>();
  const mapping: Partial<ImportMapping> = {};
  const orderedFields = [...IMPORT_FIELDS].sort((a, b) => Number(claimedRequired(b)) - Number(claimedRequired(a)));

  function claimedRequired(f: ImportField) {
    return f === 'name' || f === 'sku' || f === 'costPrice' || f === 'sellingPrice';
  }

  for (const field of orderedFields) {
    let best: { header: string; score: number } | null = null;
    for (const header of headers) {
      if (claimed.has(header)) continue;
      const score = matchScore(header, FIELD_ALIASES[field]);
      if (score !== null && (best === null || score < best.score)) {
        best = { header, score };
      }
    }
    if (best) {
      mapping[field] = best.header;
      claimed.add(best.header);
    }
  }
  return mapping;
}

interface RowData {
  name: string;
  sku: string;
  costPricePesewas: number;
  sellingPricePesewas: number;
  barcode: string | null;
  variantName: string | null;
  categoryId: string | null;
  supplierId: string | null;
  unit: UnitOfMeasure;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  openingQuantity: number | null;
  isPerishable: boolean;
  description: string | null;
}

export interface RowResult {
  rowIndex: number;
  status: 'valid' | 'invalid';
  reasons: string[];
  data?: RowData;
}

export interface ValidationReport {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: RowResult[];
}

function cell(row: string[], headers: string[], mapping: ImportMapping, field: ImportField): string {
  const header = mapping[field];
  if (!header) return '';
  const index = headers.indexOf(header);
  return index === -1 ? '' : (row[index] ?? '').trim();
}

function parseBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === '') return false; // absent perishability info defaults to "no", not an error
  if (['true', 'yes', 'y', '1'].includes(v)) return true;
  if (['false', 'no', 'n', '0'].includes(v)) return false;
  return null;
}

function parseNonNegative(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Doc 6, T-08: "a preview lists valid and invalid rows with reasons."
 * Runs for both the preview step and (again, never trusting a stale
 * preview) the commit step — see import.routes.ts.
 */
export async function validateRows(
  prisma: typeof PrismaClient,
  locationId: string,
  headers: string[],
  rows: string[][],
  mapping: ImportMapping,
): Promise<ValidationReport> {
  const [categories, suppliers, existingSkus, existingBarcodes] = await Promise.all([
    prisma.category.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
    prisma.productVariant.findMany({ where: { locationId }, select: { sku: true } }),
    prisma.productVariant.findMany({ where: { barcode: { not: null } }, select: { barcode: true } }),
  ]);
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const supplierByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));
  const dbSkus = new Set(existingSkus.map((v) => v.sku.toLowerCase()));
  const dbBarcodes = new Set(existingBarcodes.map((v) => v.barcode!.toLowerCase()));

  const seenSkusInFile = new Map<string, number>(); // lowercased sku -> first rowIndex
  const seenBarcodesInFile = new Map<string, number>();

  const results: RowResult[] = rows.map((row, i) => {
    const rowIndex = i + 1; // 1-based, and header row already excluded — matches what a spreadsheet user sees
    const reasons: string[] = [];

    const name = cell(row, headers, mapping, 'name');
    if (!name) reasons.push('Name is required.');

    const sku = cell(row, headers, mapping, 'sku');
    const skuKey = sku.toLowerCase();
    if (!sku) {
      reasons.push('SKU is required.');
    } else if (dbSkus.has(skuKey)) {
      reasons.push(`SKU "${sku}" already exists at this location.`);
    } else if (seenSkusInFile.has(skuKey)) {
      reasons.push(`SKU "${sku}" is duplicated in this file (first seen on row ${seenSkusInFile.get(skuKey)}).`);
    } else {
      seenSkusInFile.set(skuKey, rowIndex);
    }

    const costRaw = cell(row, headers, mapping, 'costPrice');
    const costPricePesewas = costRaw ? parseCedisToPesewas(costRaw) : null;
    if (!costRaw) reasons.push('Cost price is required.');
    else if (costPricePesewas === null) reasons.push(`Cost price "${costRaw}" is not a valid amount.`);

    const sellingRaw = cell(row, headers, mapping, 'sellingPrice');
    const sellingPricePesewas = sellingRaw ? parseCedisToPesewas(sellingRaw) : null;
    if (!sellingRaw) reasons.push('Selling price is required.');
    else if (sellingPricePesewas === null) reasons.push(`Selling price "${sellingRaw}" is not a valid amount.`);

    const barcodeRaw = cell(row, headers, mapping, 'barcode');
    const barcodeKey = barcodeRaw.toLowerCase();
    if (barcodeRaw) {
      if (dbBarcodes.has(barcodeKey)) reasons.push(`Barcode "${barcodeRaw}" already belongs to another product.`);
      else if (seenBarcodesInFile.has(barcodeKey)) {
        reasons.push(`Barcode "${barcodeRaw}" is duplicated in this file (first seen on row ${seenBarcodesInFile.get(barcodeKey)}).`);
      } else {
        seenBarcodesInFile.set(barcodeKey, rowIndex);
      }
    }

    const categoryRaw = cell(row, headers, mapping, 'categoryName');
    const categoryId = categoryRaw ? (categoryByName.get(categoryRaw.toLowerCase()) ?? null) : null;
    if (categoryRaw && !categoryId) reasons.push(`Category "${categoryRaw}" was not found — create it first or check spelling.`);

    const supplierRaw = cell(row, headers, mapping, 'supplierName');
    const supplierId = supplierRaw ? (supplierByName.get(supplierRaw.toLowerCase()) ?? null) : null;
    if (supplierRaw && !supplierId) reasons.push(`Supplier "${supplierRaw}" was not found — create it first or check spelling.`);

    const unitRaw = cell(row, headers, mapping, 'unit').toUpperCase();
    const unit = (unitRaw ? UNITS.find((u) => u === unitRaw) : 'EACH') as UnitOfMeasure | undefined;
    if (unitRaw && !unit) reasons.push(`Unit "${unitRaw}" is not one of ${UNITS.join(', ')}.`);

    const reorderPointRaw = cell(row, headers, mapping, 'reorderPoint');
    const reorderPoint = reorderPointRaw ? parseNonNegative(reorderPointRaw) : null;
    if (reorderPointRaw && reorderPoint === null) reasons.push(`Reorder point "${reorderPointRaw}" is not a valid number.`);

    const reorderQtyRaw = cell(row, headers, mapping, 'reorderQuantity');
    const reorderQuantity = reorderQtyRaw ? parseNonNegative(reorderQtyRaw) : null;
    if (reorderQtyRaw && reorderQuantity === null) reasons.push(`Reorder quantity "${reorderQtyRaw}" is not a valid number.`);

    const openingRaw = cell(row, headers, mapping, 'openingQuantity');
    const openingQuantity = openingRaw ? parseNonNegative(openingRaw) : null;
    if (openingRaw && openingQuantity === null) reasons.push(`Opening quantity "${openingRaw}" is not a valid number.`);

    const perishableRaw = cell(row, headers, mapping, 'isPerishable');
    const isPerishable = parseBoolean(perishableRaw);
    if (isPerishable === null) reasons.push(`Perishable "${perishableRaw}" should be yes/no or true/false.`);

    if (reasons.length > 0) return { rowIndex, status: 'invalid', reasons };

    return {
      rowIndex,
      status: 'valid',
      reasons: [],
      data: {
        name,
        sku,
        costPricePesewas: costPricePesewas!,
        sellingPricePesewas: sellingPricePesewas!,
        barcode: barcodeRaw || null,
        variantName: cell(row, headers, mapping, 'variantName') || null,
        categoryId,
        supplierId,
        unit: unit ?? 'EACH',
        reorderPoint,
        reorderQuantity,
        openingQuantity,
        isPerishable: isPerishable ?? false,
        description: cell(row, headers, mapping, 'description') || null,
      },
    };
  });

  return {
    totalRows: results.length,
    validCount: results.filter((r) => r.status === 'valid').length,
    invalidCount: results.filter((r) => r.status === 'invalid').length,
    rows: results,
  };
}

/**
 * Doc 6, T-08: "commit is all-or-nothing" and "a 1,000-row file imports
 * in under 30 seconds." Both come from the same design choice: three
 * bulk createMany calls (product, variant, opening-stock movement)
 * inside one transaction, not up to 3,000 individual .create() calls —
 * see product.service.ts's listProducts comment for why an ORM's
 * per-call overhead matters once row counts climb into the thousands.
 */
export async function commitImport(
  prisma: typeof PrismaClient,
  locationId: string,
  userId: string,
  headers: string[],
  rows: string[][],
  mapping: ImportMapping,
): Promise<{ committed: true; productsCreated: number } | { committed: false; report: ValidationReport }> {
  const report = await validateRows(prisma, locationId, headers, rows, mapping);
  if (report.invalidCount > 0) {
    return { committed: false, report };
  }

  const validRows = report.rows.filter((r): r is RowResult & { data: RowData } => r.status === 'valid');

  const products = validRows.map((r) => ({
    id: generateId(),
    name: r.data.name,
    description: r.data.description,
    categoryId: r.data.categoryId,
    supplierId: r.data.supplierId,
    unit: r.data.unit,
    isPerishable: r.data.isPerishable,
  }));
  const variants = validRows.map((r, i) => ({
    id: generateId(),
    productId: products[i]!.id,
    sku: r.data.sku,
    barcode: r.data.barcode,
    variantName: r.data.variantName,
    costPrice: toDecimal(r.data.costPricePesewas),
    sellingPrice: toDecimal(r.data.sellingPricePesewas),
    quantityOnHand: r.data.openingQuantity ?? 0,
    reorderPoint: r.data.reorderPoint,
    reorderQuantity: r.data.reorderQuantity,
    locationId,
  }));
  const movements = validRows.flatMap((r, i) =>
    r.data.openingQuantity && r.data.openingQuantity > 0
      ? [
          {
            id: generateId(),
            variantId: variants[i]!.id,
            quantityDelta: r.data.openingQuantity,
            reason: 'OPENING_BALANCE' as const,
            referenceType: 'import',
            userId,
            occurredAt: new Date(),
          },
        ]
      : [],
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.createMany({ data: products });
      await tx.productVariant.createMany({ data: variants });
      if (movements.length > 0) await tx.stockMovement.createMany({ data: movements });
    });
  } catch (err) {
    // Rare: something changed between validate and commit (e.g. a
    // concurrent import claimed the same SKU). Pinpointing which row
    // from a batched createMany failure isn't reliable across engines
    // (see product.service.ts's constraint-name-extraction comment for
    // why single-row inserts get a precise answer and this doesn't) —
    // the honest answer here is "re-validate and try again", not a
    // guess at which row.
    throw new HttpError(
      409,
      'CONFLICT',
      'The import could not be committed — something changed since the preview was generated (likely a duplicate SKU or barcode created concurrently). Re-run the preview and try again.',
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }

  return { committed: true, productsCreated: products.length };
}
