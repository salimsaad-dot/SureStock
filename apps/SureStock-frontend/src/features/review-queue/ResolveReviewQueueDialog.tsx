import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { resolveReviewQueueItem } from '../../lib/api/review-queue'
import { ApiError, type ReviewQueueItem } from '../../lib/api/types'

export function ResolveReviewQueueDialog({ item, onClose }: { item: ReviewQueueItem; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => resolveReviewQueueItem(item.id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-queue'] })
      onClose()
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-t-xl border border-border bg-surface-raised p-6 shadow-lg sm:rounded-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Resolve item</h2>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mt-3 font-display text-sm text-ink-muted">{item.reason}</p>

        <div className="mt-4">
          <TextInput label="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you check, and what was done about it?" />
        </div>

        {formError && (
          <p role="alert" className="mt-3 font-display text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button
          size="speed"
          className="mt-6 w-full"
          isLoading={mutation.isPending}
          disabled={!note.trim()}
          onClick={() => mutation.mutate()}
        >
          Mark resolved
        </Button>
      </div>
    </div>
  )
}
