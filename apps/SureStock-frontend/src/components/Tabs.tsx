import { cn } from '../lib/cn'

export interface TabItem {
  key: string
  label: string
}

/**
 * Extracts the top-tab pattern independently hand-rolled on Sales,
 * Reports, Purchasing, and Review Queue (`flex gap-1 border-b
 * border-border` + manual active/inactive classes). Settings does NOT
 * use this — its 9-tab bar is replaced with a left-nav layout instead
 * (see SettingsPage.tsx), a page-specific restructure, not this
 * top-tabs primitive.
 */
export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto border-b border-border', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          onClick={() => onChange(tab.key)}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-sm font-medium transition-colors duration-[var(--motion-state)] ease-out',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            tab.key === active ? 'border-accent text-accent-strong' : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
