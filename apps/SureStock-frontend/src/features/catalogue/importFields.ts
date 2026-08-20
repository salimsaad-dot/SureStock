import type { ImportField } from '../../lib/api/types'

export const REQUIRED_IMPORT_FIELDS: ImportField[] = ['name', 'sku', 'costPrice', 'sellingPrice']

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: 'Product name',
  sku: 'SKU',
  costPrice: 'Cost price',
  sellingPrice: 'Selling price',
  barcode: 'Barcode',
  variantName: 'Variant name',
  categoryName: 'Category',
  supplierName: 'Supplier',
  unit: 'Unit',
  reorderPoint: 'Reorder point',
  reorderQuantity: 'Reorder quantity',
  openingQuantity: 'Opening quantity',
  isPerishable: 'Perishable',
  description: 'Description',
}
