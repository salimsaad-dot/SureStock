import { apiRequest } from './client'
import type {
  CreatePurchaseOrderBody,
  ListPurchaseOrdersParams,
  PurchaseOrder,
  PurchaseOrderListResponse,
  PurchaseOrderStats,
  ReceivePurchaseOrderBody,
  RestockRecommendation,
} from './types'

export function listPurchaseOrders(params: ListPurchaseOrdersParams = {}) {
  return apiRequest<PurchaseOrderListResponse>('/purchase-orders', { query: params })
}

export function getPurchaseOrder(id: string) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}`)
}

export function createPurchaseOrder(body: CreatePurchaseOrderBody) {
  return apiRequest<PurchaseOrder>('/purchase-orders', { method: 'POST', body })
}

// A draft's whole line set is replaced on edit, matching the create body's shape.
export function updatePurchaseOrder(id: string, body: CreatePurchaseOrderBody) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}`, { method: 'PATCH', body })
}

export function sendPurchaseOrder(id: string) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}/send`, { method: 'POST' })
}

export function cancelPurchaseOrder(id: string) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}/cancel`, { method: 'POST' })
}

export function receivePurchaseOrder(id: string, body: ReceivePurchaseOrderBody) {
  return apiRequest<PurchaseOrder>(`/purchase-orders/${id}/receive`, { method: 'POST', body })
}

export function getPurchaseOrderStats() {
  return apiRequest<PurchaseOrderStats>('/purchase-orders/stats')
}

export function getRestockRecommendations() {
  return apiRequest<RestockRecommendation[]>('/purchase-orders/restock-recommendations')
}
