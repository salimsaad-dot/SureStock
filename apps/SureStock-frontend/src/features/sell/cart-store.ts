import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartLine {
  variantId: string
  productId: string
  sku: string
  productName: string
  variantName: string | null
  quantity: number
  /** Pesewas, snapshotted at add-time purely for display — the sale write always re-reads the live price server-side (Doc 2 §3.3). */
  unitPrice: number
  discountAmount: number
  discountReason: string
  imageUrl?: string | null
}

export interface HeldCart {
  id: string
  label: string
  heldAt: string
  ticketNumber: number
  lines: CartLine[]
  cartDiscountAmount: number
  cartDiscountReason: string
}

interface CartState {
  lines: CartLine[]
  cartDiscountAmount: number
  cartDiscountReason: string
  /** A per-device display number for the till receipt — GH₵ shorthand for "which sale is this," not the real receipt number the backend assigns at Charge. */
  ticketNumber: number | null
  heldCarts: HeldCart[]
  addLine: (line: Omit<CartLine, 'quantity' | 'discountAmount' | 'discountReason'>, quantity?: number) => void
  setQuantity: (variantId: string, quantity: number) => void
  removeLine: (variantId: string) => void
  setLineDiscount: (variantId: string, amount: number, reason: string) => void
  setCartDiscount: (amount: number, reason: string) => void
  clear: () => void
  /** Doc 3 App Flow §3: "Cart is parked with an optional label and the screen clears for the next customer." */
  hold: (label?: string) => void
  resume: (id: string) => void
  discardHeld: (id: string) => void
}

function nextTicketNumber(): number {
  return 1000 + Math.floor(Math.random() * 9000)
}

/**
 * Feature-scoped Zustand cart, persisted to localStorage — "cart survives
 * a page refresh" is a literal T-14 acceptance criterion, not just a
 * nice-to-have (Blueprint §09: cart state is exactly the kind of small,
 * local, per-screen state Zustand is for).
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      cartDiscountAmount: 0,
      cartDiscountReason: '',
      ticketNumber: null,
      heldCarts: [],

      addLine: (line, quantity = 1) => {
        const wasEmpty = get().lines.length === 0
        const existing = get().lines.find((l) => l.variantId === line.variantId)
        if (existing) {
          set({
            lines: get().lines.map((l) => (l.variantId === line.variantId ? { ...l, quantity: l.quantity + quantity } : l)),
          })
          return
        }
        set({
          lines: [...get().lines, { ...line, quantity, discountAmount: 0, discountReason: '' }],
          ticketNumber: wasEmpty ? nextTicketNumber() : get().ticketNumber,
        })
      },

      setQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          get().removeLine(variantId)
          return
        }
        set({ lines: get().lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)) })
      },

      removeLine: (variantId) => set({ lines: get().lines.filter((l) => l.variantId !== variantId) }),

      setLineDiscount: (variantId, amount, reason) =>
        set({ lines: get().lines.map((l) => (l.variantId === variantId ? { ...l, discountAmount: amount, discountReason: reason } : l)) }),

      setCartDiscount: (amount, reason) => set({ cartDiscountAmount: amount, cartDiscountReason: reason }),

      clear: () => set({ lines: [], cartDiscountAmount: 0, cartDiscountReason: '', ticketNumber: null }),

      hold: (label) => {
        const { lines, cartDiscountAmount, cartDiscountReason, ticketNumber, heldCarts } = get()
        if (lines.length === 0) return
        const held: HeldCart = {
          id: crypto.randomUUID(),
          label: label?.trim() || `Sale #${ticketNumber ?? nextTicketNumber()}`,
          heldAt: new Date().toISOString(),
          ticketNumber: ticketNumber ?? nextTicketNumber(),
          lines,
          cartDiscountAmount,
          cartDiscountReason,
        }
        set({ heldCarts: [...heldCarts, held], lines: [], cartDiscountAmount: 0, cartDiscountReason: '', ticketNumber: null })
      },

      resume: (id) => {
        const { heldCarts, lines, hold } = get()
        const target = heldCarts.find((h) => h.id === id)
        if (!target) return
        // Don't silently discard whatever the cashier already has going —
        // park it too, same as "hold," before swapping the held one in.
        if (lines.length > 0) hold()
        set({
          lines: target.lines,
          cartDiscountAmount: target.cartDiscountAmount,
          cartDiscountReason: target.cartDiscountReason,
          ticketNumber: target.ticketNumber,
          heldCarts: get().heldCarts.filter((h) => h.id !== id),
        })
      },

      discardHeld: (id) => set({ heldCarts: get().heldCarts.filter((h) => h.id !== id) }),
    }),
    { name: 'surestock-cart' },
  ),
)
