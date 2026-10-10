import { cn } from '../cn';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** Render the value, e.g. kobo → "₦13,000". */
  format?: (value: number) => string;
  className?: string;
}

/** − value + control. Used for quantity and the dropship price (±₦500). */
export function Stepper({
  value,
  onChange,
  label,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  format = String,
  className,
}: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  const btn =
    'inline-flex size-11 items-center justify-center rounded-full bg-paper border border-line text-lg font-bold text-ink ' +
    'hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-info';
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center gap-3', className)}
    >
      <button
        type="button"
        className={btn}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => set(value - step)}
      >
        −
      </button>
      <output aria-live="polite" className="min-w-16 text-center text-lg font-bold text-ink">
        {format(value)}
      </output>
      <button
        type="button"
        className={btn}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => set(value + step)}
      >
        +
      </button>
    </div>
  );
}
