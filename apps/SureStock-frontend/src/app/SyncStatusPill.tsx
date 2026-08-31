import { Wifi, WifiOff } from 'lucide-react'
import { useSyncStatusStore } from '../lib/offline/sync-status-store'
import { cn } from '../lib/cn'

/** Always-visible connectivity + outbox status, per T-21/T-22 — visible from every screen, not just Sell, since a manager checking Reports still needs to know sales are queued. */
export function SyncStatusPill() {
  const isOnline = useSyncStatusStore((s) => s.isOnline)
  const pendingCount = useSyncStatusStore((s) => s.pendingCount)

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-display text-[12px] font-medium',
        isOnline ? 'text-ink-muted' : 'border border-warning bg-warning-wash text-warning',
      )}
    >
      {isOnline ? <Wifi className="h-3.5 w-3.5 flex-none" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5 flex-none" aria-hidden="true" />}
      <span>{isOnline ? 'Online' : 'Offline'}</span>
      {pendingCount > 0 && (
        <span className="rounded-full border border-warning bg-warning-wash px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warning">
          {pendingCount} waiting to sync
        </span>
      )}
    </div>
  )
}
