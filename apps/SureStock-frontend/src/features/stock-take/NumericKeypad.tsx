import { Delete } from 'lucide-react'

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
]

/**
 * Doc 3 §4.2: "optimised for a phone in one hand" — an on-screen keypad
 * with large touch targets, not the OS keyboard (which needs a second
 * hand to summon reliably and covers half the screen). Decimal point
 * included since weight-based units (KG) are a real `UnitOfMeasure`.
 */
export function NumericKeypad({ onDigit, onDecimal, onBackspace }: { onDigit: (d: string) => void; onDecimal: () => void; onBackspace: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {DIGIT_ROWS.flat().map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onDigit(d)}
          className="h-14 rounded-md border border-border bg-surface-raised font-mono text-xl font-medium text-ink hover:bg-surface-sunken"
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={onDecimal}
        className="h-14 rounded-md border border-border bg-surface-raised font-mono text-xl font-medium text-ink hover:bg-surface-sunken"
      >
        .
      </button>
      <button
        type="button"
        onClick={() => onDigit('0')}
        className="h-14 rounded-md border border-border bg-surface-raised font-mono text-xl font-medium text-ink hover:bg-surface-sunken"
      >
        0
      </button>
      <button
        type="button"
        onClick={onBackspace}
        aria-label="Backspace"
        className="flex h-14 items-center justify-center rounded-md border border-border bg-surface-raised text-ink hover:bg-surface-sunken"
      >
        <Delete className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}
