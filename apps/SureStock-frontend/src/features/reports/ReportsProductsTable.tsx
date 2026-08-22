import { useQuery } from '@tanstack/react-query'
import { getReportsProducts } from '../../lib/api/reports'
import type { ReportsProductsParams } from '../../lib/api/types'
import { formatPesewas } from '../../lib/money'

export function ReportsProductsTable({ title, params }: { title: string; params: ReportsProductsParams }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'products', params],
    queryFn: () => getReportsProducts(params),
  })
  const products = data ?? []

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <table className="mt-3 w-full font-display text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="pb-2 font-semibold">Product</th>
            <th className="pb-2 text-right font-semibold">Qty Sold</th>
            <th className="pb-2 text-right font-semibold">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={3} className="py-1.5">
                  <div className="h-4 animate-pulse rounded bg-surface-sunken" />
                </td>
              </tr>
            ))}
          {!isLoading && products.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-ink-muted">
                No sales in this range.
              </td>
            </tr>
          )}
          {products.map((p) => (
            <tr key={p.variantId} className="border-t border-border">
              <td className="py-2 text-ink">{p.productName}</td>
              <td className="py-2 text-right font-mono tabular-nums text-ink-muted">{p.qtySold}</td>
              <td className="py-2 text-right font-mono tabular-nums text-ink">{formatPesewas(p.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
