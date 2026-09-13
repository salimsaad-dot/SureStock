import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Sparkline } from './Sparkline'

export type StatTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

// Tailwind needs literal class strings at build time — can't interpolate `bg-${tone}-wash`.
const TONE_CLASSES: Record<StatTone, { iconBg: string; icon: string }> = {
  neutral: { iconBg: 'bg-surface-sunken', icon: 'text-ink-muted' },
  accent: { iconBg: 'bg-accent-wash', icon: 'text-accent-strong' },
  success: { iconBg: 'bg-success-wash', icon: 'text-success' },
  warning: { iconBg: 'bg-warning-wash', icon: 'text-warning' },
  danger: { iconBg: 'bg-danger-wash', icon: 'text-danger' },
}

export interface StatCardComparison {
  /** `null` when the prior period had nothing to compare against — rendered as an honest "—", never a fabricated 0% or Infinity. */
  changePct: number | null
  /** Whether an increase is the good outcome for this metric — false for things like Refunds, where a decrease is the win. */
  goodDirectionUp: boolean
  /** e.g. "vs Jul 30 - Aug 12". */
  rangeLabel: string
}

export interface StatCardProps {
  icon: ReactNode
  label: string
  value: ReactNode
  sublabel?: string
  tone: StatTone
  active?: boolean
  onClick?: () => void
  /** Optional per-day trend, oldest first — renders a small sparkline under the value. */
  trend?: number[]
  /** Mutually exclusive with `sublabel` in practice — a colored vs-prior-period indicator instead of plain caption text. */
  comparison?: StatCardComparison
}

export function StatCard({ icon, label, value, sublabel, tone, active, onClick, trend, comparison }: StatCardProps) {
  const toneClasses = TONE_CLASSES[tone]
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-surface-raised p-4 text-left transition-colors duration-[var(--motion-state)] ease-out',
        active ? 'border-accent' : 'border-border',
        onClick && 'hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
      )}
    >
      {/* Icon on its own row, text below — real feedback from live mobile
          testing: icon-beside-text left the value too little width on a
          narrow card, so once a long value wrapped to 2 lines it sat
          lopsided next to an icon that only ever spanned the first line.
          Stacking vertically gives the value the card's full width. */}
      <span className={cn('flex h-10 w-10 flex-none items-center justify-center rounded-lg', toneClasses.iconBg, toneClasses.icon)}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-display text-[13px] text-ink-muted">{label}</span>
        <span className="break-words font-mono text-[28px] font-bold leading-tight tabular-nums text-ink">{value}</span>
        {comparison ? (
          <ComparisonLine {...comparison} />
        ) : (
          sublabel && <span className="font-display text-[11.5px] text-ink-faint">{sublabel}</span>
        )}
      </span>
      {trend && trend.length > 1 && <Sparkline data={trend} tone={tone} />}
    </Tag>
  )
}

function ComparisonLine({ changePct, goodDirectionUp, rangeLabel }: StatCardComparison) {
  if (changePct === null) {
    return <span className="font-display text-[11.5px] text-ink-faint">New · {rangeLabel}</span>
  }
  const isGood = goodDirectionUp ? changePct >= 0 : changePct <= 0
  const arrow = changePct >= 0 ? '↑' : '↓'
  return (
    <span className={cn('font-display text-[11.5px] font-medium', isGood ? 'text-success' : 'text-danger')}>
      {arrow} {Math.abs(changePct).toFixed(1)}% <span className="text-ink-faint">{rangeLabel}</span>
    </span>
  )
}
