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
  primary:
    'bg-accent text-white hover:bg-accent-strong disabled:hover:bg-accent',
  secondary:
    'bg-transparent border border-border-strong text-ink hover:bg-surface-sunken',
  danger:
    'bg-transparent border border-danger text-danger hover:bg-danger-wash',
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
          'transition-colors duration-[var(--motion-state)] ease-out',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        <span className={cn('grid grid-cols-1 grid-rows-1', isLoading && 'invisible')}>
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
