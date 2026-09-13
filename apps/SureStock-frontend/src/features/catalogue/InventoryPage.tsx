import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Package, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { FilterToolbar } from '../../components/FilterToolbar'
import { PageContainer } from '../../components/PageContainer'
import { PageHeader } from '../../components/PageHeader'
import { StatCard } from '../../components/StatCard'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableSkeleton } from '../../components/Table'
import { TextInput } from '../../components/TextInput'
import { listCategories, listProducts } from '../../lib/api/catalogue'
import type { ProductStatus, StockLevel } from '../../lib/api/types'
import { useAuthStore } from '../../lib/auth-store'
import { formatPesewas } from '../../lib/money'
import { ProductActionsMenu } from './ProductActionsMenu'
import { ProductAvatar } from './ProductAvatar'
import { StockLevelPill } from './StockLevelPill'
import { useInventoryStats } from './useInventoryStats'

const STATUS_OPTIONS: { value: ProductStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SEASONAL', label: 'Seasonal' },
  { value: 'DISCONTINUED', label: 'Discontinued' },
]

const STOCK_OPTIONS: { value: StockLevel | ''; label: string }[] = [
  { value: '', label: 'All stock levels' },
  { value: 'IN_STOCK', label: 'In stock' },
  { value: 'LOW', label: 'Low' },
  { value: 'OUT', label: 'Out' },
]

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function InventoryPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.session?.user.role)
  const canManage = role === 'OWNER' || role === 'MANAGER'

  // Seeded from the URL once on mount — lets a deep link from the
  // Dashboard's "Needs attention" list (e.g. `?stockLevel=LOW`) land
  // pre-filtered instead of on the unfiltered list.
  const [searchParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<ProductStatus | ''>('')
  const [stockLevel, setStockLevel] = useState<StockLevel | ''>(() => (searchParams.get('stockLevel') as StockLevel | null) ?? '')
  const [pageSize, setPageSize] = useState(20)

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => listCategories() })
  const { stats } = useInventoryStats()

  const filters = { q: q || undefined, categoryId: categoryId || undefined, status: status || undefined, stockLevel: stockLevel || undefined }
  const hasActiveFilters = Boolean(q || categoryId || status || stockLevel)

  function clearFilters() {
    setQ('')
    setCategoryId('')
    setStatus('')
    setStockLevel('')
  }

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['products', filters, pageSize],
    queryFn: ({ pageParam }) => listProducts({ ...filters, cursor: pageParam, limit: pageSize }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const products = useMemo(() => (data?.pages ?? []).flatMap((page) => page.items), [data])
  const rows = useMemo(
    () => products.flatMap((product) => product.variants.map((variant) => ({ product, variant }))),
    [products],
  )

  return (
    <PageContainer>
      <PageHeader
        title="Inventory"
        subtitle="Manage your products, stock levels, and pricing."
        actions={
          canManage && (
            <>
              <Link to="/inventory/settings" className="flex-none">
                <Button variant="secondary" size="default" className="flex-none">
                  Categories &amp; suppliers
                </Button>
              </Link>
              <Link to="/inventory/import" className="flex-none">
                <Button variant="secondary" size="default" className="flex-none">
                  Import
                </Button>
              </Link>
              <Link to="/inventory/stock-take" className="flex-none">
                <Button variant="secondary" size="default" className="flex-none">
                  Stock take
                </Button>
              </Link>
              <Link to="/inventory/new" className="flex-none">
                <Button size="default" className="flex-none">
                  New product
                </Button>
              </Link>
            </>
          )
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
          label="Total Products"
          value={stats.total}
          sublabel="All products in store"
          tone="accent"
          active={!stockLevel}
          onClick={() => setStockLevel('')}
        />
        <StatCard
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
          label="In Stock"
          value={stats.inStock}
          sublabel="Products available"
          tone="success"
          active={stockLevel === 'IN_STOCK'}
          onClick={() => setStockLevel('IN_STOCK')}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          label="Low Stock"
          value={stats.low}
          sublabel="Need restocking"
          tone="warning"
          active={stockLevel === 'LOW'}
          onClick={() => setStockLevel('LOW')}
        />
        <StatCard
          icon={<XCircle className="h-5 w-5" aria-hidden="true" />}
          label="Out of Stock"
          value={stats.out}
          sublabel="Currently unavailable"
          tone="danger"
          active={stockLevel === 'OUT'}
          onClick={() => setStockLevel('OUT')}
        />
      </div>

      <div className="mt-6">
        <FilterToolbar onClear={hasActiveFilters ? clearFilters : undefined}>
          <div className="w-64">
            <TextInput label="Search" placeholder="Name, SKU, or barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Category</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Status</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus | '')}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] font-medium text-ink">Stock level</span>
            <select
              className="h-11 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
              value={stockLevel}
              onChange={(e) => setStockLevel(e.target.value as StockLevel | '')}
            >
              {STOCK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </FilterToolbar>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton rows={6} columns={6} />}
            {!isLoading && rows.length === 0 && <TableEmpty columns={6} message="No products match these filters." />}
            {rows.map(({ product, variant }) => (
              <TableRow key={variant.id} className="cursor-pointer" onClick={() => navigate(`/inventory/${product.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <ProductAvatar name={product.name} imageUrl={product.imageUrl} />
                    <div>
                      <div className="text-ink">{product.name}</div>
                      {variant.variantName && <div className="text-[12px] text-ink-faint">{variant.variantName}</div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{variant.sku}</TableCell>
                <TableCell>
                  <StockLevelPill variant={variant} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatPesewas(variant.sellingPrice)}</TableCell>
                <TableCell className="text-ink-muted">{product.status}</TableCell>
                <TableCell>
                  <ProductActionsMenu product={product} canManage={canManage} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {hasNextPage ? (
            <Button variant="secondary" className="flex-none" isLoading={isFetchingNextPage} onClick={() => fetchNextPage()}>
              Load more
            </Button>
          ) : (
            <span />
          )}
          <label className="flex flex-none items-center gap-2">
            <span className="font-display text-[13px] text-ink-muted">Per page</span>
            <select
              className="h-9 rounded-md border border-border-strong bg-surface-raised px-2 font-display text-[13px] text-ink"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </PageContainer>
  )
}
