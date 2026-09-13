import { Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { useThemeStore, type ThemePreference } from '../lib/theme-store'

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Same tile-group visual language as CartPanel's payment-method pre-selector — icon + label, active state via border+wash+color, never color alone. */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <div role="radiogroup" aria-label="Theme">
      <p className="font-display text-[11px] text-ink-faint">Theme</p>
      <div className="mt-1 grid grid-cols-3 gap-1">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={theme === value}
            onClick={() => setTheme(value)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-md border py-1.5 font-display text-[11px] font-medium transition-colors duration-[var(--motion-state)] ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              theme === value ? 'border-accent bg-accent-wash text-accent-strong' : 'border-border-strong text-ink-muted hover:bg-surface-sunken',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
