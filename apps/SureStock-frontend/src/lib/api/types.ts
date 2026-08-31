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
  /** Only ever set by the offline sync path (lib/offline/) — the device's own clock at the moment of charging, never sent by an online charge. */
  soldAt?: string
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

// ---- Reports ----

export interface ReportsFilterParams {
  dateFrom: string
  dateTo: string
  userId?: string
  method?: PaymentMethod
}

export interface ReportsOverview {
  totalSales: number
  totalSalesChangePct: number | null
  grossProfit: number
  grossProfitChangePct: number | null
  transactionCount: number
  transactionCountChangePct: number | null
  avgOrderValue: number
  avgOrderValueChangePct: number | null
  refundTotal: number
  refundTotalChangePct: number | null
  totalProductCount: number
  outOfStockCount: number
  lowStockCount: number
  inventoryValue: number
  totalPurchased: number
}

export interface ReportsTrendPoint {
  date: string
  totalSales: number
}

/** CHANGE never appears here — it's folded into CASH server-side (see reports.service.ts). */
export interface PaymentBreakdownItem {
  method: PaymentMethod
  total: number
}

export interface ReportsProduct {
  variantId: string
  productId: string
  productName: string
  sku: string
  qtySold: number
  revenue: number
}

export interface ReportsProductsParams extends ReportsFilterParams {
  direction?: 'top' | 'low'
  limit?: number
  categoryId?: string
}

export type ShrinkageType = 'DAMAGE' | 'EXPIRY' | 'UNEXPLAINED_VARIANCE'

export interface ShrinkageByType {
  type: ShrinkageType
  total: number
}

export interface ShrinkageByStaff {
  userId: string
  userName: string
  damageTotal: number
  expiryTotal: number
  varianceTotal: number
  total: number
}

export interface ShrinkageReport {
  totalLoss: number
  byType: ShrinkageByType[]
  byStaff: ShrinkageByStaff[]
}

export interface StaffActivityRow {
  userId: string
  userName: string
  role: UserRole
  salesCount: number
  salesTotal: number
  discountsTotal: number
  refundsCount: number
  refundsTotal: number
  shiftCount: number
  totalVariance: number
}

// ---- Dashboard (T-25) ----

export type AttentionItemType = 'LOW_STOCK' | 'OUT_OF_STOCK' | 'TILL_VARIANCE' | 'REVIEW_QUEUE'

export interface AttentionItem {
  type: AttentionItemType
  label: string
  count: number
  linkPath: string
}

export interface DashboardResponse {
  todayRevenue: number
  todayRevenueChangePct: number | null
  todayTransactions: number
  todayTransactionsChangePct: number | null
  todayGrossProfit: number
  todayGrossProfitChangePct: number | null
  cashInDrawer: number
  trend: ReportsTrendPoint[]
  attention: AttentionItem[]
  topSellers: ReportsProduct[]
}

// ---- Onboarding (T-30) ----

export type OnboardingStepKey = 'SHOP_PROFILE' | 'CATEGORIES' | 'PRODUCTS' | 'OPENING_STOCK' | 'INVITE_STAFF' | 'HARDWARE_TEST'

export interface OnboardingStep {
  key: OnboardingStepKey
  label: string
  done: boolean
  required: boolean
  linkPath: string
}

export interface OnboardingStatus {
  steps: OnboardingStep[]
  isComplete: boolean
}

// ---- Audit log (T-31) ----

export interface AuditLogEntry {
  id: string
  userId: string | null
  userName: string | null
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
  ip: string | null
  deviceId: string | null
  createdAt: string
}

export interface AuditLogListParams {
  userId?: string
  action?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface AuditLogListResponse {
  items: AuditLogEntry[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  availableActions: string[]
}

// ---- Purchasing (T-28) ----

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseOrderLine {
  id: string
  variantId: string
  sku: string
  productName: string
  variantName: string | null
  quantityOrdered: number
  quantityReceived: number
  unitCost: number
  lineTotal: number
}

export interface PurchaseOrder {
  id: string
  orderNumber: string
  supplierId: string
  supplierName: string
  status: PurchaseOrderStatus
  expectedDate: string | null
  totalCost: number | null
  itemCount: number
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  lines: PurchaseOrderLine[]
}

export interface PurchaseOrderLineInput {
  variantId: string
  quantityOrdered: number
  unitCost: number
}

export interface CreatePurchaseOrderBody {
  supplierId: string
  expectedDate?: string
  lines: PurchaseOrderLineInput[]
}

export interface ReceivePurchaseOrderLineInput {
  lineId: string
  quantityReceived: number
  unitCost?: number
  batchCode?: string
  expiryDate?: string
}

export interface ReceivePurchaseOrderBody {
  lines: ReceivePurchaseOrderLineInput[]
}

export interface ListPurchaseOrdersParams {
  status?: PurchaseOrderStatus
  supplierId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export interface PurchaseOrderListResponse {
  items: PurchaseOrder[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface PurchaseOrderStatusBucket {
  orders: number
  total: number
}

export interface PurchaseOrderStats {
  draft: PurchaseOrderStatusBucket
  pending: PurchaseOrderStatusBucket
  partiallyReceived: PurchaseOrderStatusBucket
  received: PurchaseOrderStatusBucket
  totalPurchased: number
  periodFrom: string
  periodTo: string
}

export interface RestockRecommendation {
  variantId: string
  sku: string
  productName: string
  variantName: string | null
  quantityOnHand: number
  reorderPoint: number
  suggestedQuantity: number | null
  costPrice: number
  supplierId: string | null
  supplierName: string | null
}

// ---- Settings (T-29) ----

export interface LocationSettings {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logoUrl: string | null
  receiptHeader: string | null
  receiptFooter: string | null
  currency: string
  timezone: string
  defaultTaxRateId: string | null
  discountOverrideThresholdPercent: number
  tillVarianceThreshold: number
  pinLockoutAttempts: number
  pinLockoutMinutes: number
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  cardEnabled: boolean
  accountEnabled: boolean
  defaultReorderPoint: number | null
  defaultReorderQuantity: number | null
  notifyLowStockEnabled: boolean
  notifyTillVarianceEnabled: boolean
  notifyDailySummaryEnabled: boolean
  notificationPhone: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateLocationSettingsBody = Partial<
  Omit<LocationSettings, 'id' | 'defaultTaxRateId' | 'createdAt' | 'updatedAt'>
>

/** Cashier-safe subset the Sell screen's payment sheet reads — no receipt/security/profile fields. */
export interface CheckoutSettings {
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  cardEnabled: boolean
  accountEnabled: boolean
  discountOverrideThresholdPercent: number
}

// ---- Notifications (SMS via Africa's Talking) ----

export type NotificationType = 'LOW_STOCK' | 'TILL_VARIANCE' | 'DAILY_SUMMARY' | 'TEST'
export type NotificationStatus = 'SENT' | 'FAILED' | 'NOT_CONFIGURED'

export interface NotificationLogEntry {
  id: string
  type: NotificationType
  recipientPhone: string
  message: string
  status: NotificationStatus
  providerResponse: string | null
  createdAt: string
}

export interface StaffAdmin {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: UserRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface CreateStaffBody {
  name: string
  email?: string
  phone?: string
  password: string
  pin?: string
  role: UserRole
}

export interface UpdateStaffBody {
  name?: string
  email?: string | null
  phone?: string | null
  role?: UserRole
  isActive?: boolean
}

export interface ResetCredentialsBody {
  password?: string
  pin?: string
}

// ---- Stock take (T-27) ----

export type StockTakeScope = 'FULL' | 'CATEGORY'
export type StockTakeStatus = 'IN_PROGRESS' | 'POSTED' | 'ABANDONED'

export interface StockTake {
  id: string
  locationId: string
  scope: StockTakeScope
  categoryId: string | null
  categoryName: string | null
  status: StockTakeStatus
  startedBy: string
  startedByName: string
  startedAt: string
  postedAt: string | null
  lineCount?: number
}

export interface StockTakeLine {
  id: string
  variantId: string
  sku: string
  productName: string
  variantName: string | null
  expectedQuantity: number
  countedQuantity: number | null
  variance: number | null
  /** Integer pesewas, like every other money field. */
  varianceValue: number | null
  reason: string | null
}

export interface StockTakeDetail extends StockTake {
  lines: StockTakeLine[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface StartStockTakeBody {
  scope: StockTakeScope
  categoryId?: string
}

export interface UpdateStockTakeLineBody {
  countedQuantity?: number
  reason?: string
}

export interface ListStockTakesParams {
  status?: StockTakeStatus
  page?: number
  pageSize?: number
}

export interface StockTakeListResponse {
  items: StockTake[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface StockTakeAdjustment {
  variantId: string
  sku: string
  countedQuantity: number
  previousQuantity: number
  delta: number
}

export interface PostedStockTake extends StockTake {
  adjustments: StockTakeAdjustment[]
}

// ---- Offline sync (T-21, T-22) ----

/** GET /sync/catalogue's per-row shapes — deliberately narrower than Category/Supplier/Product/Variant above (no quantityOnHand — see sync.service.ts's own doc comment on why). */
export interface CategoryDelta {
  id: string
  name: string
  parentId: string | null
  sortOrder: number | null
  colour: string | null
  archivedAt: string | null
  updatedAt: string
}

export interface SupplierDelta {
  id: string
  name: string
  archivedAt: string | null
  updatedAt: string
}

export interface VariantDelta {
  id: string
  productId: string
  sku: string
  barcode: string | null
  variantName: string | null
  sellingPrice: number
  /** Absent for CASHIER, same rule as the live Variant type. */
  costPrice?: number
  archivedAt: string | null
  updatedAt: string
}

export interface ProductDelta {
  id: string
  name: string
  categoryId: string | null
  supplierId: string | null
  unit: ProductUnit
  taxRateId: string | null
  isPerishable: boolean
  imageUrl: string | null
  status: ProductStatus
  archivedAt: string | null
  updatedAt: string
  variants: VariantDelta[]
}

export interface SyncCatalogueResponse {
  serverTime: string
  categories: CategoryDelta[]
  suppliers: SupplierDelta[]
  products: ProductDelta[]
}

export interface SyncBatchResult {
  id: string
  status: 'ok' | 'review'
  message?: string
}

export interface SyncBatchResponse {
  results: SyncBatchResult[]
}

// ---- Review queue (T-23) ----

export type ReviewQueueItemType = 'NEGATIVE_STOCK' | 'SYNC_VALIDATION_FAILURE'

export interface ReviewQueueItem {
  id: string
  type: ReviewQueueItemType
  saleId: string | null
  saleReceiptNumber: string | null
  variantId: string | null
  variantSku: string | null
  reason: string
  details: unknown
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  resolvedByName: string | null
  resolutionNote: string | null
}

export interface ListReviewQueueParams {
  status?: 'open' | 'resolved' | 'all'
  page?: number
  pageSize?: number
}

export interface ReviewQueueListResponse {
  items: ReviewQueueItem[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
