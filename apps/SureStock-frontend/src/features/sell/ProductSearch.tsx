import { useQuery } from '@tanstack/react-query'
import { ScanLine } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { listProducts } from '../../lib/api/catalogue'
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

  const { data, isFetching } = useQuery({
    queryKey: ['products', 'sell-search', debouncedQ],
    queryFn: () => listProducts({ q: debouncedQ || undefined, limit: 20, status: 'ACTIVE' }),
    enabled: debouncedQ.length > 0,
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
          {isFetching && rows.length === 0 && <p className="col-span-full text-ink-muted">Searching…</p>}
          {!isFetching && rows.length === 0 && <p className="col-span-full text-ink-muted">No matches.</p>}
          {rows.map(({ product, variant }) => (
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
