import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  leading,
  trailing,
  className,
  id,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div
        className={cn(
          'flex min-h-11 items-center gap-2 rounded-md border bg-paper px-3.5',
          'focus-within:outline-2 focus-within:outline-info',
          error ? 'border-accent-text' : 'border-line',
        )}
      >
        {leading && <span className="text-sub">{leading}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent py-2.5 text-base text-ink outline-none placeholder:text-sub/70"
          {...rest}
        />
        {trailing && <span className="text-sub">{trailing}</span>}
      </div>
      {(error || hint) && (
        <p id={hintId} className={cn('text-sm', error ? 'text-accent-text' : 'text-sub')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
