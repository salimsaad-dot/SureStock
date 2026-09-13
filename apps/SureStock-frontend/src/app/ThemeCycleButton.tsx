import { Monitor, Moon, Sun } from 'lucide-react'
import { useThemeStore, type ThemePreference } from '../lib/theme-store'

const NEXT: Record<ThemePreference, ThemePreference> = { light: 'dark', dark: 'system', system: 'light' }
const META: Record<ThemePreference, { label: string; icon: typeof Sun }> = {
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
  system: { label: 'System', icon: Monitor },
}

/**
 * A compact one-button cycle (Light → Dark → System → …) for contexts
 * too narrow for ThemeToggle's full 3-tile picker — the mobile top bar,
 * where it sits next to SyncStatusPill and matches its pill styling.
 */
export function ThemeCycleButton() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const current = META[theme]
  const next = META[NEXT[theme]]
  const Icon = current.icon

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-display text-[12px] font-medium text-ink-muted transition-colors duration-[var(--motion-state)] ease-out hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
      <span>{current.label}</span>
    </button>
  )
}
