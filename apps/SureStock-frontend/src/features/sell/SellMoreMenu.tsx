import { MoreHorizontal, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useCartStore } from './cart-store'

export function SellMoreMenu() {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const lines = useCartStore((s) => s.lines)
  const clear = useCartStore((s) => s.clear)

  function clearCart() {
    if (lines.length > 0 && !window.confirm('Clear the current cart? This cannot be undone.')) return
    clear()
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details ref={detailsRef} className="relative inline-block">
      <summary
        aria-label="More sale actions"
        className="flex h-11 w-11 list-none items-center justify-center rounded-md border border-border-strong text-ink-muted hover:bg-surface-sunken [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-border bg-surface-raised py-1 shadow-lg">
        <button
          type="button"
          onClick={clearCart}
          disabled={lines.length === 0}
          className="flex w-full items-center gap-2 px-3 py-2 text-left font-display text-[13px] text-danger hover:bg-danger-wash disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Clear cart
        </button>
      </div>
    </details>
  )
}
