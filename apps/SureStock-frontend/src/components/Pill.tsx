import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type PillVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const variantClasses: Record<PillVariant, string> = {
  success: 'bg-success-wash text-success',
  warning: 'bg-warning-wash text-warning',
  danger: 'bg-danger-wash text-danger',
  info: 'bg-accent-wash text-accent-strong',
  neutral: 'bg-surface-sunken text-ink-muted',
}

export interface PillProps {
  variant: PillVariant
  children: ReactNode
}

/**
 * Status pills always pair color with text (Blueprint §02/§08) — there is no
 * icon-only or color-only variant, so a colorblind reader isn't relying on hue.
 */
export function Pill({ variant, children }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 font-display text-[10.5px] font-semibold uppercase tracking-wide',
        variantClasses[variant],
      )}
    >
      {children}
    </span>
  )
}
