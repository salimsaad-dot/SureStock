import { type InputHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '../lib/cn'

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visible label — never omitted, per Blueprint §08 ("visible labels always"). */
  label: string
  /** Specific problem text ("Cost price 'abc' is not a valid amount"), never a generic message. */
  error?: string
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, id, className, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="font-display text-[13px] font-medium text-ink">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'h-11 rounded-md border bg-surface-raised px-3 font-mono text-sm text-ink',
            'transition-colors duration-[var(--motion-state)] ease-out',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            'disabled:cursor-not-allowed disabled:text-ink-faint disabled:opacity-70',
            error ? 'border-danger' : 'border-border-strong',
            className,
          )}
          {...props}
        />
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
