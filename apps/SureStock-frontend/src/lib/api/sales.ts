import { apiRequest, apiRequestBlob } from './client'
import type {
  CreateRefundBody,
  CreateSaleBody,
  ListSalesParams,
  ListTillShiftsParams,
  Sale,
  SaleListResponse,
  SalesFilterParams,
  SalesStats,
  TillShift,
  TillShiftListResponse,
} from './types'

// ---- Till shifts (T-20) ----

export function openTillShift(openingFloat: number) {
  return apiRequest<TillShift>('/till-shifts', { method: 'POST', body: { openingFloat } })
}

export function getCurrentTillShift() {
  return apiRequest<TillShift | null>('/till-shifts/current')
}

export function closeTillShift(tillShiftId: string, countedCash: number, notes?: string) {
  return apiRequest<TillShift>(`/till-shifts/${tillShiftId}/close`, { method: 'POST', body: { countedCash, notes } })
}

// Doc 3 App Flow §5: the Sales screen's "Till shifts" tab. Cashiers are
// always scoped to their own shifts server-side.
export function listTillShifts(params: ListTillShiftsParams = {}) {
  return apiRequest<TillShiftListResponse>('/till-shifts', { query: params })
}

// ---- Sales (T-16, T-18) ----

export function createSale(body: CreateSaleBody) {
  return apiRequest<Sale>('/sales', { method: 'POST', body })
}

export function getSale(id: string) {
  return apiRequest<Sale>(`/sales/${id}`)
}

// Doc 3 App Flow §5: "a reverse-chronological list filterable by date,
// staff member, and payment method." Cashiers are always scoped to
// their own sales server-side, regardless of a userId passed here.
export function listSales(params: ListSalesParams = {}) {
  return apiRequest<SaleListResponse>('/sales', { query: params })
}

// Doc 4/mockup: the Sales screen's KPI cards (Total Sales, Transactions,
// Completed, Refunded, each with a per-day trend).
export function getSalesStats(params: SalesFilterParams = {}) {
  return apiRequest<SalesStats>('/sales/stats', { query: params })
}

// Doc 3 App Flow §5's "Export report" — every row matching the current
// filters as a CSV file, not just the current page.
export function exportSalesCsv(params: SalesFilterParams = {}) {
  return apiRequestBlob('/sales/export', { query: params })
}

// ---- Refunds (T-19) ----

export function createRefund(saleId: string, body: CreateRefundBody) {
  return apiRequest<Sale>(`/sales/${saleId}/refund`, { method: 'POST', body })
}
