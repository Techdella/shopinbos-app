import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'ai';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leading?: ReactNode;
  block?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/90',
  accent: 'bg-accent text-ink hover:bg-accent/90',
  ghost: 'bg-paper text-ink border border-line hover:bg-canvas',
  ai: 'bg-ai text-paper hover:bg-ai/90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-4 text-sm',
  md: 'min-h-11 px-5 text-base',
  lg: 'min-h-13 px-6 text-md',
};

/** Pill button. Primary = ink, accent = orange (main call to action), ghost = white with border. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leading,
  block,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        leading
      )}
      {children}
    </button>
  );
}
