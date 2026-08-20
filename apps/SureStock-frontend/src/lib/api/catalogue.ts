import { apiRequest, apiRequestBlob } from './client'
import type {
  Category,
  ImportCommitResponse,
  ImportMapping,
  ImportParseResponse,
  ImportValidationReport,
  Product,
  ProductListResponse,
  ProductStatus,
  ProductUnit,
  SellTile,
  StockLevel,
  Supplier,
  Variant,
  VariantInput,
} from './types'

// ---- Categories ----

export function listCategories(includeArchived = false) {
  return apiRequest<Category[]>('/categories', { query: { includeArchived } })
}

export function createCategory(body: { name: string; parentId?: string; sortOrder?: number; colour?: string }) {
  return apiRequest<Category>('/categories', { method: 'POST', body })
}

export function updateCategory(id: string, body: Partial<{ name: string; parentId: string | null; sortOrder: number; colour: string | null }>) {
  return apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', body })
}

export function archiveCategory(id: string) {
  return apiRequest<Category>(`/categories/${id}/archive`, { method: 'POST' })
}

export function restoreCategory(id: string) {
  return apiRequest<Category>(`/categories/${id}/restore`, { method: 'POST' })
}

export function deleteCategory(id: string) {
  return apiRequest<void>(`/categories/${id}`, { method: 'DELETE' })
}

// ---- Suppliers ----

export function listSuppliers(includeArchived = false) {
  return apiRequest<Supplier[]>('/suppliers', { query: { includeArchived } })
}

export function createSupplier(body: Partial<Omit<Supplier, 'id' | 'archivedAt' | 'createdAt' | 'updatedAt'>> & { name: string }) {
  return apiRequest<Supplier>('/suppliers', { method: 'POST', body })
}

export function updateSupplier(id: string, body: Partial<Omit<Supplier, 'id' | 'archivedAt' | 'createdAt' | 'updatedAt'>>) {
  return apiRequest<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body })
}

export function archiveSupplier(id: string) {
  return apiRequest<Supplier>(`/suppliers/${id}/archive`, { method: 'POST' })
}

export function restoreSupplier(id: string) {
  return apiRequest<Supplier>(`/suppliers/${id}/restore`, { method: 'POST' })
}

export function deleteSupplier(id: string) {
  return apiRequest<void>(`/suppliers/${id}`, { method: 'DELETE' })
}

// ---- Products ----

export interface ListProductsParams {
  q?: string
  categoryId?: string
  status?: ProductStatus
  stockLevel?: StockLevel
  cursor?: string
  limit?: number
}

export function listProducts(params: ListProductsParams = {}) {
  return apiRequest<ProductListResponse>('/products', { query: params })
}

export function getProduct(id: string) {
  return apiRequest<Product>(`/products/${id}`)
}

/** The exact-match scanner path (T-07) — never pays fuzzy-search latency for a real barcode. */
export function lookupByBarcode(barcode: string) {
  return apiRequest<Variant>('/products/lookup', { query: { barcode } })
}

// Doc 3 App Flow §3: the Sell screen's default browse view — real
// top-sellers and real recently-sold products, not fabricated demo data.
export function getPopularProducts(params: { categoryId?: string; limit?: number } = {}) {
  return apiRequest<SellTile[]>('/products/popular', { query: params })
}

export function getRecentProducts(params: { limit?: number } = {}) {
  return apiRequest<SellTile[]>('/products/recent', { query: params })
}

export interface CreateProductBody {
  name: string
  description?: string
  categoryId?: string
  supplierId?: string
  unit?: ProductUnit
  taxRateId?: string
  isPerishable?: boolean
  imageUrl?: string
  variants: VariantInput[]
}

export function createProduct(body: CreateProductBody) {
  return apiRequest<Product>('/products', { method: 'POST', body })
}

export function updateProduct(id: string, body: Partial<Omit<CreateProductBody, 'variants'>>) {
  return apiRequest<Product>(`/products/${id}`, { method: 'PATCH', body })
}

export function updateProductStatus(id: string, status: ProductStatus) {
  return apiRequest<Product>(`/products/${id}/status`, { method: 'PATCH', body: { status } })
}

export function addVariant(productId: string, body: VariantInput) {
  return apiRequest<Product>(`/products/${productId}/variants`, { method: 'POST', body })
}

export interface UpdateVariantBody {
  sku?: string
  barcode?: string | null
  variantName?: string | null
  costPrice?: number
  sellingPrice?: number
  reorderPoint?: number | null
  reorderQuantity?: number | null
  priceChangeReason?: string
}

export function updateVariant(productId: string, variantId: string, body: UpdateVariantBody) {
  return apiRequest<Product>(`/products/${productId}/variants/${variantId}`, { method: 'PATCH', body })
}

// ---- Spreadsheet import ----

export function downloadImportTemplate() {
  return apiRequestBlob('/products/import/template')
}

export function parseImportFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<ImportParseResponse>('/products/import/parse', { method: 'POST', body: formData })
}

export function validateImport(headers: string[], rows: string[][], mapping: ImportMapping) {
  return apiRequest<ImportValidationReport>('/products/import/validate', {
    method: 'POST',
    body: { headers, rows, mapping },
  })
}

/** 422 is a real `{committed:false, report}` body, not an error envelope — see client.ts's treatAsSuccess. */
export function commitImport(headers: string[], rows: string[][], mapping: ImportMapping) {
  return apiRequest<ImportCommitResponse>('/products/import/commit', {
    method: 'POST',
    body: { headers, rows, mapping },
    treatAsSuccess: [422],
  })
}
