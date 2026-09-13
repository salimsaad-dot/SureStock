import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { updateVariant } from '../../lib/api/catalogue'
import { ApiError, type Variant } from '../../lib/api/types'
import { parseCedisToPesewas } from '../../lib/money'

/**
 * Shared price-edit state/mutation behind VariantRow (desktop table) and
 * VariantCard (mobile card) — same variant, same rules, just two
 * different layouts for the same interaction.
 */
export function useVariantPriceEdit(productId: string, variant: Variant) {
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

  return {
    editing,
    setEditing,
    priceInput,
    setPriceInput,
    reason,
    setReason,
    priceError,
    reasonError,
    mutation,
    submit,
  }
}
