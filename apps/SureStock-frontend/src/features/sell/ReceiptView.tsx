import { Button } from '../../components/Button'
import { ReceiptCard } from '../sales/ReceiptCard'
import type { Sale } from '../../lib/api/types'

/** T-17: `GET /sales/:id` already carries everything a receipt needs — this just renders it. Printing is the browser's own print dialog. */
export function ReceiptView({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6 shadow-lg">
        <ReceiptCard sale={sale} />

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
            Print
          </Button>
          <Button className="flex-1" onClick={onClose}>
            New sale
          </Button>
        </div>
      </div>
    </div>
  )
}
