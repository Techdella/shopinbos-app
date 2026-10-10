import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  count?: number;
}

/** Filter chip: pill, 36px high on web; selected = ink background. */
export function Chip({
  selected = false,
  count,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-pill px-4 text-sm font-semibold whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info',
        selected ? 'bg-ink text-paper' : 'bg-paper text-ink border border-line hover:bg-canvas',
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined && (
        <span className={cn('text-xs', selected ? 'text-paper/70' : 'text-sub')}>{count}</span>
      )}
    </button>
  );
}
