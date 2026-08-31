import { apiRequest } from './client'
import type {
  ListStockTakesParams,
  PostedStockTake,
  StartStockTakeBody,
  StockTake,
  StockTakeDetail,
  StockTakeLine,
  StockTakeListResponse,
  UpdateStockTakeLineBody,
} from './types'

export function startStockTake(body: StartStockTakeBody) {
  return apiRequest<StockTake>('/stock-takes', { method: 'POST', body })
}

export function listStockTakes(params: ListStockTakesParams = {}) {
  return apiRequest<StockTakeListResponse>('/stock-takes', { query: params })
}

// pageSize defaults high — the counting UI wants every line in one call
// (see the backend schema's own comment for why that's fine at this scale).
export function getStockTake(id: string, pageSize = 5000) {
  return apiRequest<StockTakeDetail>(`/stock-takes/${id}`, { query: { pageSize } })
}

export function updateStockTakeLine(stockTakeId: string, lineId: string, body: UpdateStockTakeLineBody) {
  return apiRequest<StockTakeLine>(`/stock-takes/${stockTakeId}/lines/${lineId}`, { method: 'PATCH', body })
}

export function getDiscrepancies(stockTakeId: string) {
  return apiRequest<StockTakeLine[]>(`/stock-takes/${stockTakeId}/discrepancies`)
}

export function postStockTake(stockTakeId: string) {
  return apiRequest<PostedStockTake>(`/stock-takes/${stockTakeId}/post`, { method: 'POST' })
}

export function abandonStockTake(stockTakeId: string) {
  return apiRequest<StockTake>(`/stock-takes/${stockTakeId}/abandon`, { method: 'POST' })
}
