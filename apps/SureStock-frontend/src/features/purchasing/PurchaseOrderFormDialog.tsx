import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { listProducts, listSuppliers } from '../../lib/api/catalogue'
import { createPurchaseOrder, updatePurchaseOrder } from '../../lib/api/purchasing'
import { ApiError, type CreatePurchaseOrderBody, type PurchaseOrder } from '../../lib/api/types'
import { formatPesewas, parseCedisToPesewas } from '../../lib/money'

interface LineDraft {
  variantId: string
  sku: string
  productName: string
  variantName: string | null
  quantityOrdered: number
  unitCostCedis: string
}

export interface PurchaseOrderFormInitial {
  supplierId?: string
  expectedDate?: string
  lines?: LineDraft[]
}

/** Shared create/edit dialog — editing a purchase order replaces its whole line set, matching the backend's own "send the full set" PATCH shape. */
export function PurchaseOrderFormDialog({
  existing,
  initial,
  onClose,
  onSuccess,
}: {
  /** Present for edit (a DRAFT only — enforced by the caller only showing Edit on drafts). */
  existing?: PurchaseOrder
  /** Prefill for a brand-new PO, e.g. from a restock recommendation. */
  initial?: PurchaseOrderFormInitial
  onClose: () => void
  onSuccess: (po: PurchaseOrder) => void
}) {
  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? initial?.supplierId ?? '')
  const [expectedDate, setExpectedDate] = useState(existing?.expectedDate?.slice(0, 10) ?? initial?.expectedDate ?? '')
  const [lines, setLines] = useState<LineDraft[]>(
    () =>
      existing?.lines.map((l) => ({
        variantId: l.variantId,
        sku: l.sku,
        productName: l.productName,
        variantName: l.variantName,
        quantityOrdered: l.quantityOrdered,
        unitCostCedis: (l.unitCost / 100).toFixed(2),
      })) ??
      initial?.lines ??
      [],
  )
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  const { data: suppliers } = useQuery({ queryKey: ['suppliers', { includeArchived: false }], queryFn: () => listSuppliers(false) })
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['products', 'po-search', debouncedSearch],
    queryFn: () => listProducts({ q: debouncedSearch, limit: 20 }),
    enabled: debouncedSearch.length > 0,
  })
  const searchRows = (searchResults?.items ?? []).flatMap((p) => p.variants.map((v) => ({ product: p, variant: v })))

  const total = lines.reduce((sum, l) => sum + l.quantityOrdered * Math.round(Number(l.unitCostCedis || 0) * 100), 0)

  const mutation = useMutation({
    mutationFn: (body: CreatePurchaseOrderBody) => (existing ? updatePurchaseOrder(existing.id, body) : createPurchaseOrder(body)),
    onSuccess,
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function addVariant(variantId: string, sku: string, productName: string, variantName: string | null, unitCost?: number) {
    if (lines.some((l) => l.variantId === variantId)) return
    setLines((prev) => [...prev, { variantId, sku, productName, variantName, quantityOrdered: 1, unitCostCedis: unitCost !== undefined ? (unitCost / 100).toFixed(2) : '' }])
    setSearch('')
  }

  function updateLine(variantId: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)))
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId))
  }

  function submit() {
    setFormError(null)
    if (!supplierId) {
      setFormError('Choose a supplier.')
      return
    }
    if (lines.length === 0) {
      setFormError('Add at least one product.')
      return
    }
    for (const l of lines) {
      const cost = parseCedisToPesewas(l.unitCostCedis)
      if (cost === null || l.quantityOrdered <= 0) {
        setFormError(`Check the quantity and unit cost for ${l.productName}.`)
        return
      }
    }

    const body: CreatePurchaseOrderBody = {
      supplierId,
      expectedDate: expectedDate || undefined,
      lines: lines.map((l) => ({ variantId: l.variantId, quantityOrdered: l.quantityOrdered, unitCost: parseCedisToPesewas(l.unitCostCedis)! })),
    }
    mutation.mutate(body)
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">{existing ? `Edit ${existing.orderNumber}` : 'New purchase order'}</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Supplier</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Choose a supplier…</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="w-44">
            <TextInput type="date" label="Expected date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>

        <div className="relative mt-4">
          <TextInput label="Add a product" placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {debouncedSearch && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface-raised shadow-lg">
              {searching && <p className="p-3 font-display text-sm text-ink-muted">Searching…</p>}
              {!searching && searchRows.length === 0 && <p className="p-3 font-display text-sm text-ink-muted">No matches.</p>}
              {searchRows.map(({ product, variant }) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => addVariant(variant.id, variant.sku, product.name, variant.variantName, variant.costPrice)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left font-display text-sm text-ink hover:bg-accent-wash"
                >
                  <span>
                    {product.name}
                    {variant.variantName ? ` — ${variant.variantName}` : ''}
                  </span>
                  <span className="font-mono text-[12px] text-ink-faint">{variant.sku}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {lines.map((l) => (
            <li key={l.variantId} className="flex items-center gap-2 rounded-lg border border-border p-3">
              <div className="flex-1">
                <p className="font-display text-sm text-ink">
                  {l.productName}
                  {l.variantName ? ` — ${l.variantName}` : ''}
                </p>
                <p className="font-mono text-[11px] text-ink-faint">{l.sku}</p>
              </div>
              <input
                type="number"
                min={1}
                step="any"
                value={l.quantityOrdered}
                onChange={(e) => updateLine(l.variantId, { quantityOrdered: Number(e.target.value) })}
                className="h-10 w-20 rounded-md border border-border-strong bg-surface-raised px-2 text-right font-mono text-sm text-ink"
                aria-label={`Quantity for ${l.productName}`}
              />
              <input
                type="text"
                inputMode="decimal"
                value={l.unitCostCedis}
                onChange={(e) => updateLine(l.variantId, { unitCostCedis: e.target.value })}
                placeholder="0.00"
                className="h-10 w-24 rounded-md border border-border-strong bg-surface-raised px-2 text-right font-mono text-sm text-ink"
                aria-label={`Unit cost for ${l.productName}`}
              />
              <button type="button" onClick={() => removeLine(l.variantId)} className="text-ink-faint hover:text-danger" aria-label={`Remove ${l.productName}`}>
                ✕
              </button>
            </li>
          ))}
          {lines.length === 0 && <p className="font-display text-sm text-ink-muted">No products added yet.</p>}
        </ul>

        {lines.length > 0 && (
          <p className="mt-3 text-right font-display text-sm text-ink-muted">
            Total: <span className="font-mono font-semibold text-ink">{formatPesewas(total)}</span>
          </p>
        )}

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button className="mt-6 w-full" isLoading={mutation.isPending} onClick={submit}>
          {existing ? 'Save changes' : 'Create purchase order'}
        </Button>
      </div>
    </div>
  )
}
