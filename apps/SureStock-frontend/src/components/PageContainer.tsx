import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

type ContainerMaxWidth = 'xs' | 'sm' | '2xl' | '3xl' | 'full'

const MAX_WIDTH_CLASSES: Record<Exclude<ContainerMaxWidth, 'full'>, string> = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

/**
 * Covers the two "normal page" wrapper shapes used across this app:
 * full-width (`maxWidth="full"`, the default — Dashboard, Inventory,
 * Sales, Reports, Purchasing, Review Queue, Settings, detail pages) and
 * centered (`maxWidth="xs"|"sm"|"2xl"|"3xl"` — auth pages, Onboarding,
 * Staff picker, Import). Deliberately does NOT cover SellPage's
 * fixed-viewport two-pane layout or Stock Take's in-progress flow
 * (CountingScreen etc.) — those are a genuinely different "speed mode"
 * page kind, not a container variant. Don't wedge them in here; leave
 * them hand-rolled.
 */
export function PageContainer({
  maxWidth = 'full',
  className,
  children,
}: {
  maxWidth?: ContainerMaxWidth
  className?: string
  children: ReactNode
}) {
  return <main className={cn('p-6', maxWidth !== 'full' && cn('mx-auto', MAX_WIDTH_CLASSES[maxWidth]), className)}>{children}</main>
}
