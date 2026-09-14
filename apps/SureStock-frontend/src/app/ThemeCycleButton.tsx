import { Moon, Sun } from 'lucide-react'
import { useThemeStore, type ThemePreference } from '../lib/theme-store'

const NEXT: Record<ThemePreference, ThemePreference> = { light: 'dark', dark: 'light' }
const META: Record<ThemePreference, { label: string; icon: typeof Sun }> = {
  light: { label: 'Light', icon: Sun },
  dark: { label: 'Dark', icon: Moon },
}

/**
 * A compact one-button toggle (Light ↔ Dark) for contexts too narrow for
 * ThemeToggle's full tile picker — the mobile top bar, where it sits
 * next to SyncStatusPill and matches its pill styling. Just the two
 * states, deliberately: a "System" third option used to live here too,
 * dropped per direct feedback that it was a confusing extra step to a
 * dark mode someone reaches for maybe once.
 */
export function ThemeCycleButton() {
  const storedTheme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  // Real crash found live: a browser with the old 3-state 'system' value
  // already sitting in localStorage from before this became a 2-state
  // toggle could reach this render before the store's migration settled
  // (or with a version already bumped past the point migrate re-runs),
  // and `META[theme]` on an unrecognized value is `undefined` — crashing
  // the whole app on `.icon`. Falling back to 'light' here means a stale
  // or otherwise-unexpected value can never take down the page.
  const theme = storedTheme in META ? storedTheme : 'light'
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
