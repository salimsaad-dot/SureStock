import { getCatalogueDelta } from '../api/sync'
import { LAST_CATALOGUE_SYNC_KEY, offlineDb, getMeta, setMeta, type OfflineVariant } from './db'

/**
 * Doc 2 §3.2 / T-21: pulls the delta since the last successful sync
 * (omitted `since` on first-ever run) and upserts it into the local
 * IndexedDB cache. Deltas are additive/updates-only — an archived
 * category/supplier/product still arrives as a normal row with
 * `archivedAt` set, never a deletion, so a plain `bulkPut` is always
 * correct here (see sync.service.ts's own note on the one thing this
 * can't detect: a genuine hard-delete, which is already a narrow,
 * documented gap on the backend side).
 */
export async function refreshCatalogue(): Promise<void> {
  const since = await getMeta(LAST_CATALOGUE_SYNC_KEY)
  const delta = await getCatalogueDelta(since)

  await offlineDb.transaction('rw', [offlineDb.categories, offlineDb.suppliers, offlineDb.products, offlineDb.variants], async () => {
    if (delta.categories.length) await offlineDb.categories.bulkPut(delta.categories)
    if (delta.suppliers.length) await offlineDb.suppliers.bulkPut(delta.suppliers)
    if (delta.products.length) {
      await offlineDb.products.bulkPut(delta.products)
      const flattenedVariants: OfflineVariant[] = delta.products.flatMap((p) =>
        p.variants.map((v) => ({
          id: v.id,
          productId: p.id,
          productName: p.name,
          sku: v.sku,
          barcode: v.barcode,
          variantName: v.variantName,
          sellingPrice: v.sellingPrice,
          status: p.status,
          archivedAt: v.archivedAt ?? p.archivedAt,
          updatedAt: v.updatedAt,
        })),
      )
      if (flattenedVariants.length) await offlineDb.variants.bulkPut(flattenedVariants)
    }
  })

  await setMeta(LAST_CATALOGUE_SYNC_KEY, delta.serverTime)
}

/**
 * Offline fallback only, used from ProductSearch/SellPage when the live
 * `GET /products` search itself fails for lack of connectivity — never a
 * first-choice data source, since the cache has no live stock/price-change
 * awareness beyond whatever the last successful sync pulled in.
 */
export async function searchCatalogueOffline(query: string, limit = 20): Promise<OfflineVariant[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches = await offlineDb.variants
    .filter((v) => !v.archivedAt && v.status === 'ACTIVE' && (v.productName.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q)))
    .toArray()
  return matches.slice(0, limit)
}

export async function lookupBarcodeOffline(barcode: string): Promise<OfflineVariant | undefined> {
  return offlineDb.variants.where('barcode').equals(barcode).first()
}
