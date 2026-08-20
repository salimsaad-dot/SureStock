/** Money is always integer pesewas on the wire (1 GHS = 100), per lib/money.ts on the backend. */

export function formatPesewas(pesewas: number): string {
  return `GH₵ ${(pesewas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Parses a human-typed cedis string ("12.50", "GH₵12.5") into integer pesewas, or null if not a valid amount. */
export function parseCedisToPesewas(input: string): number | null {
  const cleaned = input.replace(/[^\d.]/g, '')
  if (cleaned === '') return null
  const cedis = Number(cleaned)
  if (!Number.isFinite(cedis) || cedis < 0) return null
  return Math.round(cedis * 100)
}
