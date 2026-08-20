import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../components/Table'
import { getProduct, listCategories, listSuppliers, updateProductStatus } from '../../lib/api/catalogue'
import type { ProductStatus } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'
import { VariantRow } from './VariantRow'

const STATUS_CYCLE: ProductStatus[] = ['ACTIVE', 'SEASONAL', 'DISCONTINUED']

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.session?.user.role)
  const canManage = role === 'OWNER' || role === 'MANAGER'

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id!),
  })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => listCategories(), enabled: !!product })
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers(), enabled: canManage && !!product })

  const statusMutation = useMutation({
    mutationFn: (status: ProductStatus) => updateProductStatus(id!, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', id] }),
  })

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="text-ink-muted">Loading…</p>
      </main>
    )
  }

  if (!product) {
    return (
      <main className="p-6">
        <p className="text-danger">Product not found.</p>
      </main>
    )
  }

  const categoryName = categories?.find((c) => c.id === product.categoryId)?.name
  const supplierName = suppliers?.find((s) => s.id === product.supplierId)?.name

  return (
    <main className="p-6">
      <Link to="/inventory" className="font-display text-[13px] text-ink-muted hover:text-ink">
        ← Back to inventory
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{product.name}</h1>
        {product.status === 'ACTIVE' && <Pill variant="success">Active</Pill>}
        {product.status === 'SEASONAL' && <Pill variant="warning">Seasonal</Pill>}
        {product.status === 'DISCONTINUED' && <Pill variant="danger">Discontinued</Pill>}
      </div>

      {product.description && <p className="mt-2 max-w-xl text-ink-muted">{product.description}</p>}

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-display text-sm">
        <div>
          <dt className="text-ink-faint">Category</dt>
          <dd className="text-ink">{categoryName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Supplier</dt>
          <dd className="text-ink">{supplierName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Unit</dt>
          <dd className="text-ink">{product.unit}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Perishable</dt>
          <dd className="text-ink">{product.isPerishable ? 'Yes' : 'No'}</dd>
        </div>
      </dl>

      {canManage && (
        <div className="mt-4 flex items-center gap-2">
          <span className="font-display text-[13px] text-ink-muted">Change status:</span>
          {STATUS_CYCLE.filter((s) => s !== product.status).map((s) => (
            <button
              key={s}
              type="button"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(s)}
              className="rounded-md border border-border-strong px-3 py-1.5 font-display text-[13px] text-ink hover:bg-surface-sunken disabled:opacity-50"
            >
              Mark {s.toLowerCase()}
            </button>
          ))}
        </div>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Variants</h2>
      <div className="mt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {product.variants.map((variant) => (
              <VariantRow key={variant.id} productId={product.id} variant={variant} />
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  )
}
