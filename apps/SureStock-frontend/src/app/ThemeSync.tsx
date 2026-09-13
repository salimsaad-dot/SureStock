import { useEffect } from 'react'
import { useThemeStore } from '../lib/theme-store'

/**
 * No visual output — just keeps `<html data-theme>` in sync with the
 * stored preference. Mounted once at the true app root (AppProviders),
 * not inside AppShell, so the theme applies on the login/register
 * screens too, before any session exists.
 */
export function ThemeSync() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme
    } else {
      document.documentElement.dataset.theme = theme
    }
  }, [theme])

  return null
}
