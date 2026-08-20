import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TableCell, TableRow } from '../../components/Table'
import { TextInput } from '../../components/TextInput'
import { updateVariant } from '../../lib/api/catalogue'
import { ApiError, type Variant } from '../../lib/api/types'
import { formatPesewas, parseCedisToPesewas } from '../../lib/money'
import { StockLevelPill } from './StockLevelPill'

export function VariantRow({ productId, variant }: { productId: string; variant: Variant }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [priceInput, setPriceInput] = useState(String(variant.sellingPrice / 100))
  const [reason, setReason] = useState('')
  const [priceError, setPriceError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (body: { sellingPrice: number; priceChangeReason: string }) => updateVariant(productId, variant.id, body),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['product', productId] })
    },
    onError: (err) => setPriceError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  function submit() {
    setPriceError(null)
    setReasonError(null)
    const pesewas = parseCedisToPesewas(priceInput)
    if (pesewas === null) {
      setPriceError('Enter a valid amount.')
      return
    }
    const priceChanged = pesewas !== variant.sellingPrice
    if (priceChanged && !reason.trim()) {
      setReasonError('A reason is required when changing the selling price.')
      return
    }
    mutation.mutate({ sellingPrice: pesewas, priceChangeReason: reason.trim() })
  }

  if (editing) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={6}>
          <div className="flex flex-wrap items-end gap-3 py-1">
            <span className="font-mono text-sm text-ink-muted">{variant.sku}</span>
            <TextInput label="New selling price (GH₵)" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} error={priceError ?? undefined} />
            <TextInput label="Reason for change" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonError ?? undefined} />
            <Button size="default" isLoading={mutation.isPending} onClick={submit}>
              Save
            </Button>
            <Button size="default" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow>
      <TableCell>{variant.variantName ?? '—'}</TableCell>
      <TableCell className="font-mono">{variant.sku}</TableCell>
      <TableCell className="font-mono">{variant.barcode ?? '—'}</TableCell>
      <TableCell>
        <StockLevelPill variant={variant} />{' '}
        <span className="font-mono text-ink-muted">{variant.quantityOnHand}</span>
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums">
        {formatPesewas(variant.sellingPrice)}
        {variant.costPrice !== undefined && (
          <div className="font-mono text-[11px] text-ink-faint">cost {formatPesewas(variant.costPrice)}</div>
        )}
      </TableCell>
      <TableCell>
        <Button size="default" variant="secondary" onClick={() => setEditing(true)}>
          Edit price
        </Button>
      </TableCell>
    </TableRow>
  )
}
