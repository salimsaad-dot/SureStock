import { Pill } from '../../components/Pill'
import type { Variant } from '../../lib/api/types'

export function stockLevelOf(variant: Variant): 'IN_STOCK' | 'LOW' | 'OUT' {
  if (variant.quantityOnHand <= 0) return 'OUT'
  if (variant.reorderPoint !== null && variant.quantityOnHand <= variant.reorderPoint) return 'LOW'
  return 'IN_STOCK'
}

export function StockLevelPill({ variant }: { variant: Variant }) {
  const level = stockLevelOf(variant)
  if (level === 'OUT') return <Pill variant="danger">Out</Pill>
  if (level === 'LOW') return <Pill variant="warning">Low</Pill>
  return <Pill variant="success">In stock</Pill>
}
