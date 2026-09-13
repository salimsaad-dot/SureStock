import { cn } from '../../lib/cn'

export interface SettingsNavItem {
  key: string
  label: string
}

/**
 * Redesign 2026-09: replaces the old overflow-x-auto horizontal 9-tab
 * bar (weak, and the only page in the app that needed horizontal
 * scrolling for its own nav). A left-nav on desktop, a compact select on
 * mobile — same tabs, same tab-switch behavior, all 9 sections stay
 * reachable either way. Page-specific to Settings, not the shared
 * `Tabs.tsx` top-tabs primitive used elsewhere in the app.
 */
export function SettingsNav({ items, active, onChange }: { items: SettingsNavItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <>
      <label className="block lg:hidden">
        <span className="sr-only">Settings section</span>
        <select
          className="h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink"
          value={active}
          onChange={(e) => onChange(e.target.value)}
        >
          {items.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <nav className="hidden lg:flex lg:w-56 lg:flex-none lg:flex-col lg:gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            aria-current={item.key === active ? 'page' : undefined}
            className={cn(
              'rounded-md border-l-[3px] border-transparent px-[9px] py-2 text-left font-display text-sm text-ink-muted transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken hover:text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              item.key === active && 'border-accent bg-accent-wash font-medium text-accent-strong',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  )
}
