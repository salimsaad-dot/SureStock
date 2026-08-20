import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { openTillShift } from '../../lib/api/sales'
import { ApiError } from '../../lib/api/types'
import { parseCedisToPesewas } from '../../lib/money'

const openShiftSchema = z.object({
  openingFloat: z.string().min(1, 'Enter the starting cash float.'),
})
type OpenShiftForm = z.infer<typeof openShiftSchema>

/** Doc 6 T-20: "opening float required before selling" — a cashier can't reach the Sell screen without one. */
export function OpenShiftGate() {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<OpenShiftForm>({ resolver: zodResolver(openShiftSchema), defaultValues: { openingFloat: '0' } })

  const mutation = useMutation({
    mutationFn: (values: OpenShiftForm) => {
      const pesewas = parseCedisToPesewas(values.openingFloat)
      if (pesewas === null) throw new Error('Enter a valid amount.')
      return openTillShift(pesewas)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['till-shift', 'current'] }),
    onError: (err) => setError('openingFloat', { message: err instanceof ApiError ? err.message : 'Something went wrong.' }),
  })

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center p-6">
      <p className="font-mono text-xs uppercase tracking-wide text-accent">Start of shift</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-ink">Opening cash float</h1>
      <p className="mt-2 text-ink-muted">Count the cash in the drawer before your first sale.</p>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <TextInput label="Opening float (GH₵)" inputMode="decimal" error={errors.openingFloat?.message} {...register('openingFloat')} />
        <Button type="submit" size="speed" isLoading={mutation.isPending}>
          Start selling
        </Button>
      </form>
    </main>
  )
}
