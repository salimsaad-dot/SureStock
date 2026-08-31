import { apiRequest } from './client'
import type { ListReviewQueueParams, ReviewQueueItem, ReviewQueueListResponse } from './types'

// ---- Review queue (T-23) — Manager/Owner only, matching the backend gate ----

export function listReviewQueue(params: ListReviewQueueParams = {}) {
  return apiRequest<ReviewQueueListResponse>('/review-queue', { query: params })
}

export function resolveReviewQueueItem(id: string, note: string) {
  return apiRequest<ReviewQueueItem>(`/review-queue/${id}/resolve`, { method: 'POST', body: { note } })
}
