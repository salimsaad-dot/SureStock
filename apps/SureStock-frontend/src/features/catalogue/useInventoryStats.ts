import { useQuery } from '@tanstack/react-query'
import { listProducts } from '../../lib/api/catalogue'
import type { Product, StockLevel } from '../../lib/api/types'
import { stockLevelOf } from './StockLevelPill'

// Safety cap — 25 pages of 100 covers any real shop catalogue; the backend has
// no aggregate-count endpoint yet, so this walks the cursor (see progress.md).
const MAX_PAGES = 25

async function fetchAllProducts(): Promise<Product[]> {
  const all: Product[] = []
  let cursor: string | undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await listProducts({ cursor, limit: 100 })
    all.push(...page.items)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return all
}

/** A product is bucketed by its worst variant — matches the backend's own "any variant matches" filter semantics. */
export function productStockLevel(product: Product): StockLevel {
  const levels = product.variants.map(stockLevelOf)
  if (levels.includes('OUT')) return 'OUT'
  if (levels.includes('LOW')) return 'LOW'
  return 'IN_STOCK'
}

export function useInventoryStats() {
  const { data: products, isLoading } = useQuery({ queryKey: ['products', 'all-for-stats'], queryFn: fetchAllProducts })

  const stats = {
    total: products?.length ?? 0,
    inStock: products?.filter((p) => productStockLevel(p) === 'IN_STOCK').length ?? 0,
    low: products?.filter((p) => productStockLevel(p) === 'LOW').length ?? 0,
    out: products?.filter((p) => productStockLevel(p) === 'OUT').length ?? 0,
  }

  return { stats, isLoading }
}
