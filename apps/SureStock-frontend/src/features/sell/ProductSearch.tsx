import { useQuery } from '@tanstack/react-query'
import { ScanLine, WifiOff } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { listProducts } from '../../lib/api/catalogue'
import { ApiError } from '../../lib/api/types'
import { searchCatalogueOffline } from '../../lib/offline/catalogue-cache'
import { formatPesewas } from '../../lib/money'
import { StockLevelPill, stockLevelOf } from '../catalogue/StockLevelPill'
import { useCartStore } from './cart-store'

/** `children` renders below the input only while the query is empty — the Sell screen's default browse view (category tiles, Popular/Recent grids). */
export function ProductSearch({ children }: { children?: ReactNode }) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const addLine = useCartStore((s) => s.addLine)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(timer)
  }, [q])

  const {
    data,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['products', 'sell-search', debouncedQ],
    queryFn: () => listProducts({ q: debouncedQ || undefined, limit: 20, status: 'ACTIVE' }),
    enabled: debouncedQ.length > 0,
    // A network failure (offline) shouldn't retry three times before the
    // offline fallback below kicks in — a real ApiError (e.g. an
    // unexpected 500) isn't retried here either way.
    retry: false,
    // Real bug found 2026-08-25 building T-32's Playwright E2E suite
    // (its `context.setOffline` is a genuine network-level condition,
    // unlike patching `navigator.onLine` by hand in earlier manual
    // verification — which never actually exercised this): TanStack
    // Query's default `networkMode: 'online'` PAUSES a query the moment
    // the browser reports itself offline — it never calls `queryFn` at
    // all, so it never fails, so `isOffline` below never becomes true
    // and the whole Dexie fallback path was unreachable. `'always'`
    // makes it genuinely attempt the request and fail for real, which
    // is the actual signal this component depends on.
    networkMode: 'always',
  })

  // Only a genuine connectivity failure falls back to the cache — a real
  // ApiError means the server responded and rejected the request, which
  // showing stale cached results would only obscure.
  const isOffline = error !== null && !(error instanceof ApiError)

  const { data: offlineResults } = useQuery({
    queryKey: ['products', 'sell-search-offline', debouncedQ],
    queryFn: () => searchCatalogueOffline(debouncedQ),
    enabled: isOffline && debouncedQ.length > 0,
    // Same root cause as the live query's own `networkMode: 'always'`
    // above, just easier to miss: this query never touches the network
    // at all (it reads the local Dexie cache), but TanStack Query
    // doesn't know that — its default `networkMode: 'online'` pauses
    // ANY query while the browser reports itself offline, including
    // ones with nothing to do with connectivity. Without this, the
    // offline fallback would never actually run while genuinely offline
    // — the one situation it exists for.
    networkMode: 'always',
  })

  const rows = (data?.items ?? []).flatMap((product) => product.variants.map((variant) => ({ product, variant })))

  return (
    <div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by product name, SKU or scan barcode…"
          className="h-14 w-full rounded-lg border border-border-strong bg-surface-raised px-4 font-display text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
        {/* A USB scanner works anywhere on this screen already (see useBarcodeScanner) — this just focuses the field as a visible affordance that scanning is supported here. */}
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="flex h-14 flex-none items-center gap-2 rounded-lg border border-border-strong px-4 font-display text-sm font-medium text-accent hover:bg-accent-wash"
        >
          <ScanLine className="h-5 w-5" aria-hidden="true" /> Scan barcode
        </button>
      </div>

      {debouncedQ ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {isOffline && (
            <p className="col-span-full flex items-center gap-1.5 font-display text-[13px] text-warning">
              <WifiOff className="h-3.5 w-3.5 flex-none" aria-hidden="true" /> Offline — showing cached products (stock levels unavailable).
            </p>
          )}
          {isOffline && (offlineResults ?? []).length === 0 && <p className="col-span-full text-ink-muted">No cached matches.</p>}
          {isOffline &&
            (offlineResults ?? []).map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() =>
                  addLine({
                    variantId: variant.id,
                    productId: variant.productId,
                    sku: variant.sku,
                    productName: variant.productName,
                    variantName: variant.variantName,
                    unitPrice: variant.sellingPrice,
                  })
                }
                className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface-raised p-4 text-left transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="font-display text-sm font-semibold text-ink">
                  {variant.productName}
                  {variant.variantName && <span className="text-ink-faint"> — {variant.variantName}</span>}
                </span>
                <span className="font-mono text-[11px] text-ink-faint">{variant.sku}</span>
                <span className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">{formatPesewas(variant.sellingPrice)}</span>
              </button>
            ))}

          {!isOffline && isFetching && rows.length === 0 && <p className="col-span-full text-ink-muted">Searching…</p>}
          {!isOffline && !isFetching && rows.length === 0 && <p className="col-span-full text-ink-muted">No matches.</p>}
          {!isOffline &&
            rows.map(({ product, variant }) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => {
                // Doc 3 App Flow §3: "Out-of-stock items still appear, marked, and can be sold with a confirmation."
                if (stockLevelOf(variant) === 'OUT' && !window.confirm(`${product.name} is out of stock. Sell it anyway?`)) return
                addLine({
                  variantId: variant.id,
                  productId: product.id,
                  sku: variant.sku,
                  productName: product.name,
                  variantName: variant.variantName,
                  unitPrice: variant.sellingPrice,
                  imageUrl: product.imageUrl,
                })
              }}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface-raised p-4 text-left transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="font-display text-sm font-semibold text-ink">
                {product.name}
                {variant.variantName && <span className="text-ink-faint"> — {variant.variantName}</span>}
              </span>
              <span className="font-mono text-[11px] text-ink-faint">{variant.sku}</span>
              <div className="mt-1 flex w-full items-center justify-between">
                <StockLevelPill variant={variant} />
                <span className="font-mono text-lg font-semibold tabular-nums text-ink">{formatPesewas(variant.sellingPrice)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
