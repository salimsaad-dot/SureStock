export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER'

export interface AuthUser {
  id: string
  name: string
  role: UserRole
  locationId: string
}

export interface StaffMember {
  id: string
  name: string
  role: UserRole
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

/** Mirrors the backend's error envelope exactly (`src/plugins/error-handler.ts`). */
export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.details = body.details
  }
}

export function isLockedError(error: unknown): error is ApiError & { details: { lockedUntil: string } } {
  return error instanceof ApiError && error.code === 'LOCKED'
}

// ---- Catalogue (T-05–T-08) ----

export interface Category {
  id: string
  name: string
  parentId: string | null
  sortOrder: number | null
  colour: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  leadTimeDays: number | null
  paymentTerms: string | null
  notes: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ProductUnit = 'EACH' | 'KG' | 'LITRE' | 'PACK' | 'METRE'
export type ProductStatus = 'ACTIVE' | 'DISCONTINUED' | 'SEASONAL'
export type StockLevel = 'IN_STOCK' | 'LOW' | 'OUT'

/** The Sell screen's quick-pick tile shape (`GET /products/popular`, `GET /products/recent`) — just enough to render and add to cart, not the full catalogue `Variant`. */
export interface SellTile {
  id: string
  productId: string
  productName: string
  sku: string
  sellingPrice: number
  quantityOnHand: number
  imageUrl: string | null
}

export interface Variant {
  id: string
  productId: string
  sku: string
  barcode: string | null
  variantName: string | null
  /** Only present on the barcode-lookup endpoint (`GET /products/lookup`) — the parent product's name, since that response has no other way to show a human-readable name. */
  productName?: string
  /** Integer pesewas — never a float, per lib/money.ts. */
  sellingPrice: number
  /** Absent entirely (not null) in responses served to a CASHIER. */
  costPrice?: number
  quantityOnHand: number
  reorderPoint: number | null
  reorderQuantity: number | null
  locationId: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  description: string | null
  categoryId: string | null
  supplierId: string | null
  unit: ProductUnit
  taxRateId: string | null
  isPerishable: boolean
  imageUrl: string | null
  status: ProductStatus
  createdAt: string
  updatedAt: string
  variants: Variant[]
}

export interface ProductListResponse {
  items: Product[]
  nextCursor: string | null
}

export interface VariantInput {
  sku: string
  barcode?: string
  variantName?: string
  costPrice: number
  sellingPrice: number
  reorderPoint?: number
  reorderQuantity?: number
  openingQuantity?: number
}

// ---- Spreadsheet import (T-08) ----

export const IMPORT_FIELDS = [
  'name', 'sku', 'costPrice', 'sellingPrice', 'barcode', 'variantName',
  'categoryName', 'supplierName', 'unit', 'reorderPoint', 'reorderQuantity',
  'openingQuantity', 'isPerishable', 'description',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export type ImportMapping = Partial<Record<ImportField, string>>

export interface ImportParseResponse {
  headers: string[]
  rows: string[][]
  suggestedMapping: ImportMapping
  availableFields: readonly ImportField[]
}

export interface ImportRowResult {
  rowIndex: number
  status: 'valid' | 'invalid'
  reasons: string[]
  data?: Record<string, unknown>
}

export interface ImportValidationReport {
  totalRows: number
  validCount: number
  invalidCount: number
  rows: ImportRowResult[]
}

export type ImportCommitResponse =
  | { committed: true; productsCreated: number }
  | { committed: false; report: ImportValidationReport }

// ---- Selling (T-16, T-18, T-19, T-20) ----

export interface TillShift {
  id: string
  userId: string
  openedAt: string
  openingFloat: number
  closedAt: string | null
  expectedCash: number | null
  countedCash: number | null
  variance: number | null
  notes: string | null
}

export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'CARD' | 'ACCOUNT'
export type PaymentMethodWithChange = PaymentMethod | 'CHANGE'
export type SaleStatus = 'COMPLETED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'VOID'

export interface SaleLine {
  id: string
  variantId: string
  productNameSnapshot: string
  quantity: number
  unitPrice: number
  /** Absent for CASHIER, same rule as everywhere else. */
  unitCost?: number
  discountAmount: number | null
  discountReason: string | null
  lineTotal: number
  taxAmount: number
  /** How much of this line has already been refunded — 0 on a refund sale's own lines (a refund can't itself be refunded). */
  quantityRefunded: number
}

export interface Payment {
  id: string
  method: PaymentMethodWithChange
  amount: number
  reference: string | null
  provider: string | null
  status: 'CONFIRMED' | 'PENDING' | 'FAILED'
}

export interface Sale {
  id: string
  receiptNumber: string
  locationId: string
  tillShiftId: string
  userId: string
  customerId: string | null
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  /** Absent for CASHIER. */
  costTotal?: number
  status: SaleStatus
  refundOfSaleId: string | null
  soldAt: string
  lines: SaleLine[]
  payments: Payment[]
}

export interface SaleLineInput {
  variantId: string
  quantity: number
  discountAmount?: number
  discountReason?: string
}

export interface PaymentInput {
  method: PaymentMethod
  amount: number
  reference?: string
  provider?: string
}

export interface ManagerOverrideInput {
  managerId: string
  managerPin: string
  reason: string
}

export interface CreateSaleBody {
  id: string
  customerId?: string
  lines: SaleLineInput[]
  cartDiscountAmount?: number
  cartDiscountReason?: string
  payments: PaymentInput[]
  managerOverride?: ManagerOverrideInput
  deviceId?: string
}

export interface RefundLineInput {
  saleLineId: string
  quantity: number
  restock: boolean
}

export interface CreateRefundBody {
  id: string
  lines: RefundLineInput[]
  method: PaymentMethod
  reason: string
}

export interface SaleListItem {
  id: string
  receiptNumber: string
  soldAt: string
  userId: string
  userName: string
  total: number
  status: SaleStatus
  refundOfSaleId: string | null
  paymentMethods: PaymentMethodWithChange[]
}

export interface SalesFilterParams {
  dateFrom?: string
  dateTo?: string
  userId?: string
  method?: PaymentMethod
}

export interface ListSalesParams extends SalesFilterParams {
  page?: number
  pageSize?: number
}

export interface SaleListResponse {
  items: SaleListItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface DailyStat {
  date: string
  totalSales: number
  transactionCount: number
  completedCount: number
  refundedCount: number
}

export interface SalesStats {
  totalSales: number
  transactionCount: number
  completedCount: number
  refundedCount: number
  dailyTrend: DailyStat[]
}

export interface TillShiftListItem extends TillShift {
  userName: string
  status: 'OPEN' | 'CLOSED'
}

export interface ListTillShiftsParams {
  page?: number
  pageSize?: number
  dateFrom?: string
  dateTo?: string
  userId?: string
  status?: 'OPEN' | 'CLOSED'
}

export interface TillShiftListResponse {
  items: TillShiftListItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
