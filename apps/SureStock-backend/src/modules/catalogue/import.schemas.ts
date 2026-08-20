import { z } from 'zod';

// Every field a spreadsheet column can be mapped onto. name/sku/costPrice/
// sellingPrice are required — everything else is optional and simply
// left unset on the created product/variant when not mapped.
export const IMPORT_FIELDS = [
  'name',
  'sku',
  'costPrice',
  'sellingPrice',
  'barcode',
  'variantName',
  'categoryName',
  'supplierName',
  'unit',
  'reorderPoint',
  'reorderQuantity',
  'openingQuantity',
  'isPerishable',
  'description',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const mappingSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  costPrice: z.string().min(1),
  sellingPrice: z.string().min(1),
  barcode: z.string().min(1).optional(),
  variantName: z.string().min(1).optional(),
  categoryName: z.string().min(1).optional(),
  supplierName: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  reorderPoint: z.string().min(1).optional(),
  reorderQuantity: z.string().min(1).optional(),
  openingQuantity: z.string().min(1).optional(),
  isPerishable: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type ImportMapping = z.infer<typeof mappingSchema>;

export const validateImportBodySchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  mapping: mappingSchema,
});
export type ValidateImportBody = z.infer<typeof validateImportBodySchema>;
