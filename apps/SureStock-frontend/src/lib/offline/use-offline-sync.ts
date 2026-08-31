import { useEffect } from 'react'
import { refreshCatalogue } from './catalogue-cache'
import { drainOutbox, refreshPendingCount } from './outbox'
import { useSyncStatusStore } from './sync-status-store'

const RETRY_INTERVAL_MS = 45_000

/**
 * Wires the offline sync engine to the app's lifecycle: refresh the
 * catalogue cache and drain the outbox on load and whenever connectivity
 * returns, plus a periodic retry while online in case a prior drain failed
 * for a transient reason. Mounted once from AppShell, gated on having a
 * real session (no point syncing before login).
 */
export function useOfflineSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    function syncNow() {
      refreshCatalogue().catch((err) => console.error('Catalogue refresh failed:', err))
      drainOutbox().catch((err) => console.error('Outbox drain failed:', err))
    }

    function handleOnline() {
      useSyncStatusStore.getState().setOnline(true)
      syncNow()
    }
    function handleOffline() {
      useSyncStatusStore.getState().setOnline(false)
    }

    useSyncStatusStore.getState().setOnline(navigator.onLine)
    refreshPendingCount().catch((err) => console.error('Reading outbox count failed:', err))
    if (navigator.onLine) syncNow()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const interval = setInterval(() => {
      if (navigator.onLine) drainOutbox().catch((err) => console.error('Outbox drain failed:', err))
    }, RETRY_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [enabled])
}
