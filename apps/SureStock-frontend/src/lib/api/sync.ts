import { apiRequest } from './client'
import type { CreateSaleBody, SyncBatchResponse, SyncCatalogueResponse } from './types'

// ---- Offline sync (T-21, T-22) ----

/** `since` omitted means a full pull — first-ever sync, or after clearing the local cache. */
export function getCatalogueDelta(since?: string) {
  return apiRequest<SyncCatalogueResponse>('/sync/catalogue', { query: since ? { since } : {} })
}

/** Each sale gets its own createSale() server-side — never all-or-nothing, so one bad sale in the batch doesn't block the rest from syncing. */
export function syncBatch(sales: CreateSaleBody[]) {
  return apiRequest<SyncBatchResponse>('/sync/batch', { method: 'POST', body: { sales } })
}
