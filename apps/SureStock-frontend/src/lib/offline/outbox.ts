import { syncBatch } from '../api/sync'
import type { CreateSaleBody } from '../api/types'
import { offlineDb } from './db'
import { useSyncStatusStore } from './sync-status-store'

export async function refreshPendingCount(): Promise<void> {
  const count = await offlineDb.outbox.where('status').anyOf('pending', 'failed').count()
  useSyncStatusStore.getState().setPendingCount(count)
}

/** Called from PaymentSheet when a charge can't reach the server — the sale is real from the cashier's side (Doc 2 §3.2: "the sale happened"), just not delivered yet. */
export async function enqueueSale(body: CreateSaleBody): Promise<void> {
  await offlineDb.outbox.put({ id: body.id, body, createdAt: new Date().toISOString(), status: 'pending', attempts: 0 })
  await refreshPendingCount()
}

let draining = false

/**
 * Drains the whole outbox in one `POST /sync/batch` call. A per-sale
 * result of 'ok' or 'review' both mean the server has durably handled it
 * (a 'review' result already has a real ReviewQueueItem written for it in
 * the same transaction as the sale) — only a request that throws outright
 * (a genuine network drop or infra fault, not a per-sale business
 * rejection) leaves anything in the queue for the next attempt.
 */
export async function drainOutbox(): Promise<void> {
  if (draining || !navigator.onLine) return
  draining = true
  try {
    const pending = await offlineDb.outbox.where('status').anyOf('pending', 'failed').sortBy('createdAt')
    if (pending.length === 0) return
    const ids = pending.map((p) => p.id)

    await offlineDb.outbox.where('id').anyOf(ids).modify({ status: 'syncing' })

    try {
      const { results } = await syncBatch(pending.map((p) => p.body))
      const resultById = new Map(results.map((r) => [r.id, r]))
      const handledIds = ids.filter((id) => {
        const status = resultById.get(id)?.status
        return status === 'ok' || status === 'review'
      })
      if (handledIds.length) await offlineDb.outbox.bulkDelete(handledIds)

      const stillQueuedIds = ids.filter((id) => !handledIds.includes(id))
      if (stillQueuedIds.length) await offlineDb.outbox.where('id').anyOf(stillQueuedIds).modify({ status: 'failed' })
    } catch (err) {
      await offlineDb.outbox.where('id').anyOf(ids).modify((entry) => {
        entry.status = 'failed'
        entry.attempts += 1
        entry.lastError = err instanceof Error ? err.message : 'Sync failed.'
      })
    }
  } finally {
    draining = false
    await refreshPendingCount()
  }
}
