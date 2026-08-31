import { create } from 'zustand'

interface SyncStatusState {
  isOnline: boolean
  /** Sales sitting in the local outbox, not yet accepted by the server (either 'pending' or 'failed' — see outbox.ts). */
  pendingCount: number
  setOnline: (online: boolean) => void
  setPendingCount: (count: number) => void
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  isOnline: navigator.onLine,
  pendingCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
}))
