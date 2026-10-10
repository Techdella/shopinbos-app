import { useId } from 'react';
import { cn } from '../cn';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  /** Hide the visible label (it stays available to screen readers). */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Switch, 46×28 on web. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  hideLabel,
  disabled,
  className,
}: ToggleProps) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className={cn(hideLabel && 'sr-only')}>
        <label htmlFor={id} className="block text-base font-semibold text-ink">
          {label}
        </label>
        {description && <p className="text-sm text-sub">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-[46px] shrink-0 items-center rounded-pill transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-ok' : 'bg-line',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block size-[22px] rounded-full bg-paper shadow-card transition-transform',
            checked ? 'translate-x-[21px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  );
}
