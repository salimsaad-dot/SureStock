import Dexie, { type Table } from 'dexie'
import type { CategoryDelta, CreateSaleBody, ProductDelta, SupplierDelta } from '../api/types'

/**
 * A flattened, denormalized copy of a variant for fast offline search/scan
 * (indexed by sku/barcode) without a join back to `products` on every
 * keystroke. `productName`/`unit` are copied in at upsert time rather than
 * looked up live — same "denormalize for the read path that actually needs
 * it" reasoning as sync.service.ts's own catalogue-delta shape.
 */
export interface OfflineVariant {
  id: string
  productId: string
  productName: string
  sku: string
  barcode: string | null
  variantName: string | null
  sellingPrice: number
  status: ProductDelta['status']
  archivedAt: string | null
  updatedAt: string
}

export type OutboxStatus = 'pending' | 'syncing' | 'failed'

/**
 * One row per queued offline sale, keyed by the sale's own client-generated
 * id (the same id createSale() uses as its idempotency key) — so re-queuing
 * the same sale twice is a no-op `put`, never a duplicate row.
 */
export interface OutboxEntry {
  id: string
  body: CreateSaleBody
  createdAt: string
  status: OutboxStatus
  attempts: number
  lastError?: string
}

export interface MetaEntry {
  key: string
  value: string
}

class SureStockOfflineDB extends Dexie {
  categories!: Table<CategoryDelta, string>
  suppliers!: Table<SupplierDelta, string>
  products!: Table<ProductDelta, string>
  variants!: Table<OfflineVariant, string>
  outbox!: Table<OutboxEntry, string>
  meta!: Table<MetaEntry, string>

  constructor() {
    super('surestock-offline')
    this.version(1).stores({
      categories: 'id, updatedAt',
      suppliers: 'id, updatedAt',
      products: 'id, categoryId, updatedAt',
      variants: 'id, productId, sku, barcode, updatedAt',
      outbox: 'id, status, createdAt',
      meta: 'key',
    })
  }
}

export const offlineDb = new SureStockOfflineDB()

export const LAST_CATALOGUE_SYNC_KEY = 'lastCatalogueSync'

export async function getMeta(key: string): Promise<string | undefined> {
  return (await offlineDb.meta.get(key))?.value
}

export async function setMeta(key: string, value: string): Promise<void> {
  await offlineDb.meta.put({ key, value })
}
