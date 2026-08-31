import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/Table'
import { cancelPurchaseOrder, getPurchaseOrder, sendPurchaseOrder } from '../../lib/api/purchasing'
import type { PurchaseOrder } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'
import { useToast } from '../../lib/toast-store'
import { PurchaseOrderFormDialog } from './PurchaseOrderFormDialog'
import { PurchaseOrderStatusPill } from './PurchaseOrderStatusPill'
import { ReceivePurchaseOrderDialog } from './ReceivePurchaseOrderDialog'

/** Doc 3/mockup: a purchase order's own detail — line items, status, and the actions available at that status (Edit/Send/Cancel while a draft, Receive once sent). */
export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const show = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data: po, isLoading } = useQuery({ queryKey: ['purchase-order', id], queryFn: () => getPurchaseOrder(id!) })

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
  }

  async function handleSend() {
    setBusy(true)
    try {
      await sendPurchaseOrder(id!)
      refresh()
      show('Purchase order sent to supplier.')
    } catch {
      show('Could not send the purchase order.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this purchase order?')) return
    setBusy(true)
    try {
      await cancelPurchaseOrder(id!)
      refresh()
      show('Purchase order cancelled.')
    } catch {
      show('Could not cancel the purchase order.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function handleEditSuccess(updated: PurchaseOrder) {
    setEditOpen(false)
    refresh()
    show(`${updated.orderNumber} updated.`)
  }

  function handleReceiveSuccess(updated: PurchaseOrder) {
    setReceiveOpen(false)
    refresh()
    show(updated.status === 'RECEIVED' ? 'All items received.' : 'Partial receipt recorded.')
  }

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="text-ink-muted">Loading…</p>
      </main>
    )
  }

  if (!po) {
    return (
      <main className="p-6">
        <p className="text-danger">Purchase order not found.</p>
      </main>
    )
  }

  const canEdit = po.status === 'DRAFT'
  const canSend = po.status === 'DRAFT'
  const canCancel = po.status === 'DRAFT' || po.status === 'SENT'
  const canReceive = po.status === 'SENT' || po.status === 'PARTIAL'

  return (
    <main className="p-6">
      <Link to="/purchasing" className="font-display text-[13px] text-ink-muted hover:text-ink">
        ← Back to purchasing
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{po.orderNumber}</h1>
        <PurchaseOrderStatusPill status={po.status} />
      </div>
      <p className="mt-0.5 font-body text-sm text-ink-muted">
        {po.supplierName} · Ordered {new Date(po.createdAt).toLocaleDateString()} by {po.createdByName}
        {po.expectedDate && ` · Expected ${new Date(po.expectedDate).toLocaleDateString()}`}
      </p>

      <div className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Unit cost</TableHead>
              <TableHead className="text-right">Line total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {po.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  {line.productName}
                  {line.variantName ? ` — ${line.variantName}` : ''}
                </TableCell>
                <TableCell className="font-mono text-[12px] text-ink-faint">{line.sku}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{line.quantityOrdered}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{line.quantityReceived}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatPesewas(line.unitCost)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatPesewas(line.lineTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-right font-display text-sm text-ink-muted">
          Total: <span className="font-mono font-semibold text-ink">{formatPesewas(po.totalCost ?? 0)}</span>
        </p>
      </div>

      <div className="mt-6 flex max-w-md flex-wrap gap-2">
        {canEdit && (
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        )}
        {canSend && (
          <Button isLoading={busy} onClick={handleSend}>
            Send to supplier
          </Button>
        )}
        {canReceive && <Button onClick={() => setReceiveOpen(true)}>Receive stock</Button>}
        {canCancel && (
          <Button variant="danger" isLoading={busy} onClick={handleCancel}>
            Cancel order
          </Button>
        )}
      </div>

      {editOpen && <PurchaseOrderFormDialog existing={po} onClose={() => setEditOpen(false)} onSuccess={handleEditSuccess} />}
      {receiveOpen && <ReceivePurchaseOrderDialog po={po} onClose={() => setReceiveOpen(false)} onSuccess={handleReceiveSuccess} />}
    </main>
  )
}
