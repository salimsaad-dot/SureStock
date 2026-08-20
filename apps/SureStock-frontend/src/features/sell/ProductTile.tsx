import { Plus } from 'lucide-react'
import { ProductAvatar } from '../catalogue/ProductAvatar'
import type { SellTile } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'
import { useCartStore } from './cart-store'

/** A single "add to cart" tile — Doc 3 App Flow §3's "grid of category tiles and favourite products." */
export function ProductTile({ tile }: { tile: SellTile }) {
  const addLine = useCartStore((s) => s.addLine)
  const outOfStock = tile.quantityOnHand <= 0

  function add() {
    // Doc 3 App Flow §3: "Out-of-stock items still appear, marked, and
    // can be sold with a confirmation" — not blocked outright.
    if (outOfStock && !window.confirm(`${tile.productName} is out of stock. Sell it anyway?`)) return
    addLine({
      variantId: tile.id,
      productId: tile.productId,
      sku: tile.sku,
      productName: tile.productName,
      variantName: null,
      unitPrice: tile.sellingPrice,
      imageUrl: tile.imageUrl,
    })
  }

  return (
    <div className="relative flex flex-col items-start gap-2 rounded-lg border border-border bg-surface-raised p-3">
      <button
        type="button"
        onClick={add}
        aria-label={`Add ${tile.productName}`}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
      <ProductAvatar name={tile.productName} imageUrl={tile.imageUrl} size="large" />
      <div className="w-full">
        <p className="truncate font-display text-sm font-medium text-ink">{tile.productName}</p>
        <p className="font-mono text-sm font-semibold tabular-nums text-ink">{formatPesewas(tile.sellingPrice)}</p>
        <p className={`mt-0.5 font-display text-[11px] font-medium ${outOfStock ? 'text-danger' : 'text-success'}`}>
          {outOfStock ? 'Out of stock' : `${tile.quantityOnHand} in stock`}
        </p>
      </div>
    </div>
  )
}
