import { Pill } from '../../components/Pill'
import type { SaleStatus } from '../../lib/api/types'

/**
 * A refund transaction's own `status` field is always `COMPLETED` in
 * this schema — only the *original* sale's status moves to
 * `REFUNDED`/`PARTIALLY_REFUNDED` (see createRefund on the backend).
 * `isRefund` (pass `refundOfSaleId !== null`) overrides the literal
 * status so a refund row in a list reads as "Refunded," not
 * "Completed."
 */
export function SaleStatusPill({ status, isRefund }: { status: SaleStatus; isRefund?: boolean }) {
  if (isRefund) return <Pill variant="danger">Refunded</Pill>

  switch (status) {
    case 'COMPLETED':
      return <Pill variant="success">Completed</Pill>
    case 'PARTIALLY_REFUNDED':
      return <Pill variant="warning">Partially refunded</Pill>
    case 'REFUNDED':
      return <Pill variant="danger">Refunded</Pill>
    case 'VOID':
      return <Pill variant="danger">Void</Pill>
  }
}
