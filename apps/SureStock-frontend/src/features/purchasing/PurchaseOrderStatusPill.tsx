import { Pill } from '../../components/Pill'
import type { PurchaseOrderStatus } from '../../lib/api/types'

export function PurchaseOrderStatusPill({ status }: { status: PurchaseOrderStatus }) {
  switch (status) {
    case 'DRAFT':
      return <Pill variant="neutral">Draft</Pill>
    case 'SENT':
      return <Pill variant="warning">Pending</Pill>
    case 'PARTIAL':
      return <Pill variant="info">Partially received</Pill>
    case 'RECEIVED':
      return <Pill variant="success">Received</Pill>
    case 'CANCELLED':
      return <Pill variant="danger">Cancelled</Pill>
  }
}
