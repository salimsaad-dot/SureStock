import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { SellTile } from '../../lib/api/types'
import { ProductTile } from './ProductTile'

export function QuickPickGrid({
  title,
  queryKey,
  queryFn,
  showViewAll,
}: {
  title: string
  queryKey: unknown[]
  queryFn: () => Promise<SellTile[]>
  showViewAll?: boolean
}) {
  const { data, isLoading } = useQuery({ queryKey, queryFn })
  const tiles = data ?? []

  if (!isLoading && tiles.length === 0) return null

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        {showViewAll && (
          <Link to="/inventory" className="font-display text-[13px] font-medium text-accent hover:text-accent-strong">
            View all products →
          </Link>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-surface-sunken" />)
          : tiles.map((tile) => <ProductTile key={tile.id} tile={tile} />)}
      </div>
    </section>
  )
}
