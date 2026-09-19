import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/cn'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
export type ButtonSize = 'default' | 'speed'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** 'default' meets the 44px density-mode touch target; 'speed' is the 56px Speed-mode size (Blueprint §08). */
  size?: ButtonSize
  isLoading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  // text-surface, not text-white: --accent inverts lightness between
  // themes (dark in light mode, light in dark mode, tokens.css), so a
  // fixed white label drops to ~2:1 contrast in dark mode — well under
  // WCAG AA. --surface flips the opposite way, so it stays high-contrast
  // against accent's mid-toned lightness in both themes.
  primary:
    'bg-accent text-surface hover:bg-accent-strong active:bg-accent-strong disabled:hover:bg-accent',
  secondary:
    'bg-transparent border border-border-strong text-ink hover:bg-surface-sunken active:bg-surface-sunken',
  danger:
    'bg-transparent border border-danger text-danger hover:bg-danger-wash active:bg-danger-wash',
}

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-11 px-4 text-sm',
  speed: 'h-14 px-6 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'default', isLoading = false, disabled, className, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 rounded-md font-display font-semibold',
          'transition-[background-color,border-color,color,transform] duration-[var(--motion-state)] ease-out',
          'active:scale-[0.97]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {/* shrink-0: this grid wrapper keeps the button's width stable
            while isLoading swaps the label for a spinner (both occupy the
            same grid cell). But Tailwind's grid-cols-1 track is
            minmax(0, 1fr) — an explicit zero minimum, not content-based —
            so as a flex child of the button's own inline-flex row it had
            no protection against the button being squeezed by upstream
            layout pressure (e.g. a narrow table column): it would
            collapse straight to 0 width and the label would silently
            overflow and get clipped, rather than the button sizing to
            fit its own text like any other button. Found via live mobile
            testing — a table's "Deactivate" button was rendering at 0
            content width with the text spilling out past the card edge. */}
        <span className={cn('grid shrink-0 grid-cols-1 grid-rows-1', isLoading && 'invisible')}>
          <span className="col-start-1 row-start-1 flex items-center gap-2">{children}</span>
        </span>
        {isLoading && (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner />
          </span>
        )}
      </button>
    )
  },
)
Button.displayName = 'Button'
