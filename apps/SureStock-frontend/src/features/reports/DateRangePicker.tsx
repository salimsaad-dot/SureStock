import { Calendar } from 'lucide-react'
import { useRef } from 'react'
import { formatRangeLabel, presetRange, toDateInputValue, type RangePreset } from './date-range'

const PRESETS: RangePreset[] = ['7D', '30D', '3M', '12M']

export function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: Date
  dateTo: Date
  onChange: (range: { dateFrom: Date; dateTo: Date }) => void
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  function applyPreset(preset: RangePreset) {
    onChange(presetRange(preset))
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details ref={detailsRef} className="relative inline-block">
      <summary className="flex h-11 list-none items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 font-display text-sm text-ink [&::-webkit-details-marker]:hidden">
        <Calendar className="h-4 w-4 text-ink-faint" aria-hidden="true" />
        {formatRangeLabel(dateFrom, dateTo)}
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-72 rounded-md border border-border bg-surface-raised p-3 shadow-lg">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className="flex-1 rounded-md border border-border-strong py-1.5 font-display text-[12.5px] font-medium text-ink hover:bg-surface-sunken"
            >
              {p}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-display text-[11.5px] text-ink-muted">From</span>
            <input
              type="date"
              value={toDateInputValue(dateFrom)}
              max={toDateInputValue(dateTo)}
              onChange={(e) => e.target.value && onChange({ dateFrom: new Date(`${e.target.value}T00:00:00`), dateTo })}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 font-display text-[13px] text-ink"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-display text-[11.5px] text-ink-muted">To</span>
            <input
              type="date"
              value={toDateInputValue(dateTo)}
              min={toDateInputValue(dateFrom)}
              onChange={(e) => e.target.value && onChange({ dateFrom, dateTo: new Date(`${e.target.value}T23:59:59`) })}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 font-display text-[13px] text-ink"
            />
          </label>
        </div>
      </div>
    </details>
  )
}
