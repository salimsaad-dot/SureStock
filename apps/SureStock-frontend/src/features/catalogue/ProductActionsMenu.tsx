import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreVertical } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { updateProductStatus } from '../../lib/api/catalogue'
import type { Product, ProductStatus } from '../../lib/api/types'

const STATUS_ACTIONS: { status: ProductStatus; label: string }[] = [
  { status: 'ACTIVE', label: 'Mark active' },
  { status: 'SEASONAL', label: 'Mark seasonal' },
  { status: 'DISCONTINUED', label: 'Mark discontinued' },
]

export function ProductActionsMenu({ product, canManage }: { product: Product; canManage: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const statusMutation = useMutation({
    mutationFn: (status: ProductStatus) => updateProductStatus(product.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  return (
    <details className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <summary
        aria-label="Product actions"
        className="flex h-8 w-8 list-none items-center justify-center rounded-md text-ink-faint hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border border-border bg-surface-raised py-1 shadow-lg">
        <button
          type="button"
          onClick={() => navigate(`/inventory/${product.id}`)}
          className="block w-full px-3 py-2 text-left font-display text-[13px] text-ink hover:bg-surface-sunken"
        >
          View details
        </button>
        {canManage &&
          STATUS_ACTIONS.filter((a) => a.status !== product.status).map((a) => (
            <button
              key={a.status}
              type="button"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(a.status)}
              className="block w-full px-3 py-2 text-left font-display text-[13px] text-ink hover:bg-surface-sunken disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
      </div>
    </details>
  )
}
