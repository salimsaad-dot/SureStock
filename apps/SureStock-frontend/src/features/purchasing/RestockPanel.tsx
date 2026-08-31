import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/Table'
import { getRestockRecommendations } from '../../lib/api/purchasing'
import type { RestockRecommendation } from '../../lib/api/types'
import type { PurchaseOrderFormInitial } from './PurchaseOrderFormDialog'

/**
 * Doc 3/mockup "Restock recommendations": variants at or below their own
 * reorder point. A single "Create purchase order" button across
 * multiple suppliers isn't real, though — a PurchaseOrder belongs to
 * exactly one supplier (Doc 5's schema, correctly), so "creating a PO"
 * from a mixed-supplier list means picking one supplier's items —
 * this groups by supplier for the full Restock tab, and for the
 * compact embedded panel (which mirrors the mockup's undifferentiated
 * list) defaults to whichever supplier is most common among what's
 * shown, filtering the rest out of that one order rather than
 * fabricating a cross-supplier PO.
 */
function buildInitial(rows: RestockRecommendation[], forcedSupplierId?: string | null): PurchaseOrderFormInitial {
  const supplierId = forcedSupplierId ?? rows.find((r) => r.supplierId)?.supplierId ?? undefined
  const filtered = supplierId ? rows.filter((r) => r.supplierId === supplierId) : rows
  return {
    supplierId,
    lines: filtered.map((r) => ({
      variantId: r.variantId,
      sku: r.sku,
      productName: r.productName,
      variantName: r.variantName,
      quantityOrdered: r.suggestedQuantity ?? Math.max(1, r.reorderPoint - r.quantityOnHand),
      unitCostCedis: (r.costPrice / 100).toFixed(2),
    })),
  }
}

function RestockRow({ r }: { r: RestockRecommendation }) {
  return (
    <TableRow>
      <TableCell>
        {r.productName}
        {r.variantName ? ` — ${r.variantName}` : ''}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums text-danger">{r.quantityOnHand}</TableCell>
      <TableCell className="text-right font-mono tabular-nums text-ink-muted">{r.reorderPoint}</TableCell>
      <TableCell className="text-right font-mono tabular-nums text-ink">{r.suggestedQuantity ?? '—'}</TableCell>
      <TableCell className="text-ink-muted">{r.supplierName ?? '—'}</TableCell>
    </TableRow>
  )
}

/** The compact side panel embedded on the Purchase Orders tab, matching the mockup's flat top-N list. */
export function RestockSummaryPanel({ onCreate }: { onCreate: (initial: PurchaseOrderFormInitial) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['restock-recommendations'], queryFn: getRestockRecommendations })
  const rows = data ?? []
  const shown = rows.slice(0, 5)
  const dominantSupplierId = rows.find((r) => r.supplierId)?.supplierId ?? null
  const dominantSupplierName = rows.find((r) => r.supplierId === dominantSupplierId)?.supplierName ?? null

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h3 className="font-display text-sm font-semibold text-ink">Restock recommendations</h3>
      {rows.length > 0 && <p className="mt-0.5 font-display text-[12px] font-medium text-danger">{rows.length} products need restocking</p>}

      <div className="mt-3 flex flex-col divide-y divide-border">
        {isLoading && <p className="py-3 font-display text-sm text-ink-muted">Loading…</p>}
        {!isLoading && rows.length === 0 && <p className="py-3 font-display text-sm text-ink-muted">Nothing needs restocking right now.</p>}
        {shown.map((r) => (
          <div key={r.variantId} className="grid grid-cols-4 gap-2 py-2 font-display text-[12px]">
            <span className="col-span-2 truncate text-ink">{r.productName}</span>
            <span className="text-right font-mono text-ink-muted">{r.quantityOnHand}</span>
            <span className="text-right font-mono text-accent">{r.suggestedQuantity ?? '—'}</span>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <>
          {dominantSupplierName && (
            <p className="mt-2 font-display text-[11px] text-ink-faint">
              Ordering from {dominantSupplierName} — see the Restock tab for other suppliers.
            </p>
          )}
          <Button className="mt-3 w-full" onClick={() => onCreate(buildInitial(rows, dominantSupplierId))}>
            Create purchase order ({rows.length} items)
          </Button>
        </>
      )}
    </div>
  )
}

/** The full Restock tab: every recommendation, grouped by supplier so each group can become a real, single-supplier purchase order. */
export function RestockTab({ onCreate }: { onCreate: (initial: PurchaseOrderFormInitial) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['restock-recommendations'], queryFn: getRestockRecommendations })
  const rows = data ?? []

  const groups = new Map<string, { supplierId: string | null; supplierName: string | null; items: RestockRecommendation[] }>()
  for (const r of rows) {
    const key = r.supplierId ?? 'none'
    const group = groups.get(key) ?? { supplierId: r.supplierId, supplierName: r.supplierName, items: [] }
    group.items.push(r)
    groups.set(key, group)
  }

  if (isLoading) return <p className="font-display text-sm text-ink-muted">Loading…</p>
  if (rows.length === 0) return <EmptyState message="Nothing needs restocking right now." />

  return (
    <div className="flex flex-col gap-6">
      {[...groups.values()].map((group) => (
        <div key={group.supplierId ?? 'none'} className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-ink">{group.supplierName ?? 'No supplier set'}</h3>
            <Button size="default" onClick={() => onCreate(buildInitial(group.items, group.supplierId))} disabled={!group.supplierId}>
              Create PO ({group.items.length})
            </Button>
          </div>
          <div className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Min stock</TableHead>
                  <TableHead className="text-right">Suggested</TableHead>
                  <TableHead>Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((r) => (
                  <RestockRow key={r.variantId} r={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  )
}
