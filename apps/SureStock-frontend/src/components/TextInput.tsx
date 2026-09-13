import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from 'react'
import { cn } from '../lib/cn'

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label — never omitted, per Blueprint §08 ("visible labels always"). */
  label: string
  /** Specific problem text ("Cost price 'abc' is not a valid amount"), never a generic message. */
  error?: string
  /** Leading icon (e.g. an envelope/lock glyph) — decorative only, never the sole cue for what the field is. */
  icon?: ReactNode
  /** Trailing slot for an inline control, e.g. a password-visibility toggle button. */
  endAdornment?: ReactNode
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, id, className, icon, endAdornment, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="font-display text-[13px] font-medium text-ink">
          {label}
        </label>
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint" aria-hidden="true">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              // Redesign 2026-09: plain text (names, emails, search) reads as
              // font-display now — font-mono is reserved for genuine
              // identifiers (SKU/barcode/PO/ticket numbers), applied by the
              // caller via className where that's actually what the field is.
              'h-11 w-full rounded-md border bg-surface-raised px-3 font-display text-sm text-ink',
              'transition-colors duration-[var(--motion-state)] ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              'disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-70',
              icon && 'pl-9',
              endAdornment && 'pr-10',
              error ? 'border-danger' : 'border-border-strong',
              className,
            )}
            {...props}
          />
          {endAdornment && <span className="absolute inset-y-0 right-2 flex items-center">{endAdornment}</span>}
        </div>
        {error && (
          <p id={errorId} className="font-display text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
    )
  },
)
TextInput.displayName = 'TextInput'
