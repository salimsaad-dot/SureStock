import { X } from 'lucide-react'
import { useCartStore } from './cart-store'

/** Doc 3 App Flow §3: "Held carts appear as chips above the search field." */
export function HeldCartChips() {
  const heldCarts = useCartStore((s) => s.heldCarts)
  const resume = useCartStore((s) => s.resume)
  const discardHeld = useCartStore((s) => s.discardHeld)

  if (heldCarts.length === 0) return null

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {heldCarts.map((held) => (
        <div key={held.id} className="flex items-center gap-1.5 rounded-full border border-accent bg-accent-wash py-1 pl-3 pr-1.5">
          <button type="button" onClick={() => resume(held.id)} className="font-display text-[13px] font-medium text-accent-strong">
            {held.label} · {held.lines.length} item{held.lines.length === 1 ? '' : 's'}
          </button>
          <button
            type="button"
            onClick={() => discardHeld(held.id)}
            aria-label={`Discard held sale ${held.label}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-accent-strong hover:bg-accent hover:text-white"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
