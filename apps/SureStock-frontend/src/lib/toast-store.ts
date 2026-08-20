import { create } from 'zustand'

export type ToastVariant = 'default' | 'error'

export interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastState {
  toasts: ToastItem[]
  show: (message: string, variant?: ToastVariant) => string
  dismiss: (id: string) => void
}

/**
 * Errors persist until dismissed; everything else auto-dismisses after 4s
 * with a hover pause — timing lives in ToastViewport, not here (Blueprint §06).
 */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, variant = 'default') => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }))
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  return useToastStore((state) => state.show)
}
