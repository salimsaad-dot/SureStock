import { useEffect, useRef } from 'react'
import { cn } from '../lib/cn'
import { useToastStore, type ToastVariant } from '../lib/toast-store'

const AUTO_DISMISS_MS = 4000

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'border-border bg-surface-raised text-ink',
  success: 'border-success bg-success-wash text-success',
  warning: 'border-warning bg-warning-wash text-warning',
  error: 'border-danger bg-danger-wash text-danger',
}

function ToastTile({ id, message, variant }: { id: string; message: string; variant: ToastVariant }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const remainingRef = useRef(AUTO_DISMISS_MS)
  const startedAtRef = useRef(Date.now())
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (variant === 'error') return
    startedAtRef.current = Date.now()
    timeoutRef.current = setTimeout(() => dismiss(id), remainingRef.current)
    return () => clearTimeout(timeoutRef.current)
  }, [id, variant, dismiss])

  const pause = () => {
    if (variant === 'error') return
    clearTimeout(timeoutRef.current)
    remainingRef.current -= Date.now() - startedAtRef.current
  }

  const resume = () => {
    if (variant === 'error') return
    startedAtRef.current = Date.now()
    timeoutRef.current = setTimeout(() => dismiss(id), remainingRef.current)
  }

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border px-4 py-3 font-display text-sm shadow-lg',
        'transition-all duration-[var(--motion-sheet)] ease-out',
        VARIANT_CLASSES[variant],
      )}
    >
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(id)}
        className="flex-none text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        ×
      </button>
    </div>
  )
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastTile key={t.id} {...t} />
      ))}
    </div>
  )
}
