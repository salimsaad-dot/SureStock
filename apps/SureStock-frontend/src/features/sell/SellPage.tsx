import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { getPopularProducts, getRecentProducts, lookupByBarcode } from '../../lib/api/catalogue'
import { getCurrentTillShift } from '../../lib/api/sales'
import { ApiError, type PaymentMethod, type Sale } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'
import { useToast } from '../../lib/toast-store'
import { CartPanel } from './CartPanel'
import { CategoryTiles } from './CategoryTiles'
import { useCartStore } from './cart-store'
import { HeldCartChips } from './HeldCartChips'
import { OpenShiftGate } from './OpenShiftGate'
import { PaymentSheet } from './PaymentSheet'
import { ProductSearch } from './ProductSearch'
import { QuickPickGrid } from './QuickPickGrid'
import { ReceiptView } from './ReceiptView'
import { SellMoreMenu } from './SellMoreMenu'
import { useBarcodeScanner } from './useBarcodeScanner'

export function SellPage() {
  const role = useAuthStore((s) => s.session?.user.role)
  const { data: shift, isLoading } = useQuery({ queryKey: ['till-shift', 'current'], queryFn: getCurrentTillShift })
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [preferredMethod, setPreferredMethod] = useState<PaymentMethod>('CASH')
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const lines = useCartStore((s) => s.lines)
  const ticketNumber = useCartStore((s) => s.ticketNumber)
  const addLine = useCartStore((s) => s.addLine)
  const hold = useCartStore((s) => s.hold)
  const show = useToast()
  const queryClient = useQueryClient()

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const variant = await lookupByBarcode(code)
        addLine({
          variantId: variant.id,
          productId: variant.productId,
          sku: variant.sku,
          productName: variant.productName ?? variant.variantName ?? variant.sku,
          variantName: null,
          unitPrice: variant.sellingPrice,
        })
        show('Added to cart.')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          show(
            role === 'CASHIER' ? `No product with that barcode — ask a manager.` : `No product with that barcode — check spelling or add it to inventory.`,
            'error',
          )
        } else {
          show('Could not look up that barcode.', 'error')
        }
      }
    },
    [addLine, role, show],
  )
  useBarcodeScanner(handleScan, Boolean(shift))

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="text-ink-muted">Loading…</p>
      </main>
    )
  }

  if (!shift) {
    return <OpenShiftGate />
  }

  return (
    <div className="flex h-svh flex-col lg:flex-row">
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Sell</h1>
            <p className="mt-0.5 font-body text-sm text-ink-muted">Scan barcode or search for a product to start a sale.</p>
          </div>
          <div className="flex items-center gap-2">
            {ticketNumber && (
              <div className="rounded-lg border border-border bg-surface-raised px-3 py-2">
                <p className="font-display text-[11px] text-ink-faint">Current sale</p>
                <p className="font-mono text-sm font-semibold text-ink">#{ticketNumber}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => hold()}
              disabled={lines.length === 0}
              className="h-11 rounded-md border border-border-strong px-4 font-display text-sm font-medium text-ink hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
            >
              Hold sale
            </button>
            <SellMoreMenu />
          </div>
        </div>

        <HeldCartChips />

        <div className="mt-4">
          <ProductSearch>
            <div className="mt-4">
              <CategoryTiles value={categoryId} onChange={setCategoryId} />
            </div>
            <QuickPickGrid
              title="Popular Products"
              queryKey={['products', 'popular', categoryId]}
              queryFn={() => getPopularProducts({ categoryId: categoryId || undefined })}
              showViewAll
            />
            {!categoryId && (
              <QuickPickGrid title="Recent Products" queryKey={['products', 'recent']} queryFn={() => getRecentProducts({ limit: 4 })} />
            )}
          </ProductSearch>
        </div>
      </main>

      <div className="w-full flex-none lg:w-96">
        <CartPanel
          onCheckout={(method) => {
            setPreferredMethod(method)
            setPaymentOpen(true)
          }}
        />
      </div>

      {paymentOpen && (
        <PaymentSheet
          initialMethod={preferredMethod}
          onClose={() => setPaymentOpen(false)}
          onSuccess={(sale) => {
            setPaymentOpen(false)
            setCompletedSale(sale)
            queryClient.invalidateQueries({ queryKey: ['till-shift', 'current'] })
          }}
        />
      )}

      {completedSale && <ReceiptView sale={completedSale} onClose={() => setCompletedSale(null)} />}
    </div>
  )
}
