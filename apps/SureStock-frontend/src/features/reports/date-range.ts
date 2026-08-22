export type RangePreset = '7D' | '30D' | '3M' | '12M'

const PRESET_DAYS: Record<RangePreset, number> = { '7D': 7, '30D': 30, '3M': 90, '12M': 365 }

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(23, 59, 59, 999)
  return copy
}

export function presetRange(preset: RangePreset, today: Date = new Date()): { dateFrom: Date; dateTo: Date } {
  const dateTo = endOfDay(today)
  const dateFrom = startOfDay(new Date(today.getTime() - (PRESET_DAYS[preset] - 1) * 86_400_000))
  return { dateFrom, dateTo }
}

/** Mirrors reports.service.ts's own prior-period formula exactly, so the label shown always matches what the backend actually compared against. */
export function priorPeriodRange(dateFrom: Date, dateTo: Date): { dateFrom: Date; dateTo: Date } {
  const durationMs = dateTo.getTime() - dateFrom.getTime()
  const priorDateTo = new Date(dateFrom.getTime() - 1)
  const priorDateFrom = new Date(priorDateTo.getTime() - durationMs)
  return { dateFrom: priorDateFrom, dateTo: priorDateTo }
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export function formatRangeLabel(dateFrom: Date, dateTo: Date): string {
  return `${SHORT_DATE.format(dateFrom)} - ${SHORT_DATE.format(dateTo)}`
}

export function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10)
}
