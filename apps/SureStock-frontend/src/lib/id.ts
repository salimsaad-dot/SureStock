/**
 * `crypto.randomUUID()` is gated behind "secure context" in every major
 * browser — it silently doesn't exist over plain http on a LAN IP (the
 * exact setup used for on-device mobile testing), which is what broke
 * checkout: PaymentSheet's submit() threw before the sale POST ever went
 * out. `crypto.getRandomValues` has no such restriction, so it's used to
 * build an equivalent v4 UUID by hand when `randomUUID` isn't there.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6]! & 0x0f) | 0x40
    bytes[8] = (bytes[8]! & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Last-resort fallback for an environment with neither API — fine for a
  // locally-generated id, nothing security-sensitive depends on it.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
