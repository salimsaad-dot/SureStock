import { apiRequest, apiRequestBlob } from './client'
import type {
  PaymentBreakdownItem,
  ReportsFilterParams,
  ReportsOverview,
  ReportsProduct,
  ReportsProductsParams,
  ReportsTrendPoint,
  ShrinkageReport,
  StaffActivityRow,
} from './types'

export function getReportsOverview(params: ReportsFilterParams) {
  return apiRequest<ReportsOverview>('/reports/overview', { query: params })
}

export function getReportsTrend(params: ReportsFilterParams) {
  return apiRequest<ReportsTrendPoint[]>('/reports/trend', { query: params })
}

export function getPaymentBreakdown(params: ReportsFilterParams) {
  return apiRequest<PaymentBreakdownItem[]>('/reports/payment-breakdown', { query: params })
}

export function getReportsProducts(params: ReportsProductsParams) {
  return apiRequest<ReportsProduct[]>('/reports/products', { query: params })
}

export function getShrinkageReport(params: ReportsFilterParams) {
  return apiRequest<ShrinkageReport>('/reports/shrinkage', { query: params })
}

export function getStaffActivity(params: ReportsFilterParams) {
  return apiRequest<StaffActivityRow[]>('/reports/staff-activity', { query: params })
}

export function exportReportsCsv(params: ReportsFilterParams) {
  return apiRequestBlob('/reports/export', { query: params })
}
