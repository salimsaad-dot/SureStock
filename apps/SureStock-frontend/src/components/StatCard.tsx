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

export interface StatCardProps {
  icon: ReactNode
  label: string
  value: ReactNode
  sublabel: string
  tone: StatTone
  active?: boolean
  onClick?: () => void
  /** Optional per-day trend, oldest first — renders a small sparkline under the value. */
  trend?: number[]
}

export function StatCard({ icon, label, value, sublabel, tone, active, onClick, trend }: StatCardProps) {
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
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 flex-none items-center justify-center rounded-lg', toneClasses.iconBg, toneClasses.icon)}>
          {icon}
        </span>
        <span className="flex flex-col">
          <span className="font-display text-[13px] text-ink-muted">{label}</span>
          <span className="font-mono text-2xl font-semibold tabular-nums text-ink">{value}</span>
          <span className="font-display text-[11.5px] text-ink-faint">{sublabel}</span>
        </span>
      </div>
      {trend && trend.length > 1 && <Sparkline data={trend} tone={tone} />}
    </Tag>
  )
}
