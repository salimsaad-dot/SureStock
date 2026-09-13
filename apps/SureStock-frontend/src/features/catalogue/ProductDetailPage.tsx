import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { PageContainer } from '../../components/PageContainer'
import { PageHeader } from '../../components/PageHeader'
import { Pill } from '../../components/Pill'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '../../components/Table'
import { getProduct, listCategories, listSuppliers, updateProduct, updateProductStatus } from '../../lib/api/catalogue'
import type { ProductStatus } from '../../lib/api/types'
import { uploadImage } from '../../lib/api/uploads'
import { useAuthStore } from '../../lib/auth-store'
import { useToast } from '../../lib/toast-store'
import { ProductAvatar } from './ProductAvatar'
import { VariantCard } from './VariantCard'
import { VariantRow } from './VariantRow'

const STATUS_CYCLE: ProductStatus[] = ['ACTIVE', 'SEASONAL', 'DISCONTINUED']

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.session?.user.role)
  const canManage = role === 'OWNER' || role === 'MANAGER'
  const show = useToast()

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

  const photoMutation = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await uploadImage(file)
      return updateProduct(id!, { imageUrl: url })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] })
      show('Photo updated.')
    },
    onError: () => show("Couldn't upload that image — try a JPEG, PNG, or WebP under 5MB.", 'error'),
  })

  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-ink-muted">Loading…</p>
      </PageContainer>
    )
  }

  if (!product) {
    return (
      <PageContainer>
        <p className="text-danger">Product not found.</p>
      </PageContainer>
    )
  }

  const categoryName = categories?.find((c) => c.id === product.categoryId)?.name
  const supplierName = suppliers?.find((s) => s.id === product.supplierId)?.name

  const statusPill =
    (product.status === 'ACTIVE' && <Pill variant="success">Active</Pill>) ||
    (product.status === 'SEASONAL' && <Pill variant="warning">Seasonal</Pill>) ||
    (product.status === 'DISCONTINUED' && <Pill variant="danger">Discontinued</Pill>) ||
    undefined

  return (
    <PageContainer>
      <PageHeader
        variant="detail"
        title={product.name}
        subtitle={product.description || undefined}
        backTo="/inventory"
        backLabel="Back to inventory"
        statusPill={statusPill}
      />

      <div className="mt-4 flex items-center gap-3">
        <ProductAvatar name={product.name} imageUrl={product.imageUrl} size="large" />
        {canManage && (
          <label className="font-display text-[13px] font-medium text-accent hover:text-accent-strong">
            {photoMutation.isPending ? 'Uploading…' : product.imageUrl ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photoMutation.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) photoMutation.mutate(file)
                e.target.value = ''
              }}
              className="sr-only"
            />
          </label>
        )}
      </div>

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
        <div className="mt-4 flex flex-wrap items-center gap-2">
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

      {/* A horizontally-scrolling table is the right call for a long
          product list (Inventory), but this product usually has just
          one or two variants — forcing the same scroll-table here read
          as broken on a phone (real feedback from live mobile testing),
          not responsive. Below md this is a stack of cards instead. */}
      <div className="mt-3 hidden md:block">
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
      <div className="mt-3 flex flex-col gap-3 md:hidden">
        {product.variants.map((variant) => (
          <VariantCard key={variant.id} productId={product.id} variant={variant} />
        ))}
      </div>
    </PageContainer>
  )
}
