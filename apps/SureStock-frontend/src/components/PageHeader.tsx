import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'

interface PageHeaderPageProps {
  variant?: 'page'
  title: string
  subtitle?: string
  actions?: ReactNode
}

interface PageHeaderDetailProps {
  variant: 'detail'
  title: string
  subtitle?: string
  /** Route to go back to. */
  backTo: string
  /** Exact contextual link text (e.g. "Back to inventory") — keep this identical to whatever the page already renders, so adopting this component doesn't change accessible text. */
  backLabel: string
  /** Rendered next to the title, e.g. a status Pill. */
  statusPill?: ReactNode
  actions?: ReactNode
}

export type PageHeaderProps = PageHeaderPageProps | PageHeaderDetailProps

/**
 * Two shapes, matching what every page in this app already hand-rolls:
 * 'page' (bare title/subtitle, optional right-aligned actions — Dashboard,
 * Inventory, Sales, Reports, Purchasing, Review Queue, Settings) and
 * 'detail' (back-link → title+status-pill row → subtitle — Product/Sale/
 * PurchaseOrder detail pages). SellPage and Stock Take's in-progress flow
 * intentionally don't use this — they're a different "speed mode" page
 * kind, not a header/container variant.
 */
export function PageHeader(props: PageHeaderProps) {
  if (props.variant === 'detail') {
    const { title, subtitle, backTo, backLabel, statusPill, actions } = props
    return (
      <div>
        <Link to={backTo} className="font-display text-[13px] text-ink-muted hover:text-ink">
          ← {backLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
            {statusPill}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {subtitle && <p className="mt-1 font-display text-sm text-ink-muted">{subtitle}</p>}
      </div>
    )
  }

  const { title, subtitle, actions } = props
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', !actions && 'items-center')}>
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 font-display text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
