import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface StatProps {
  label: string;
  value: ReactNode;
  /** e.g. "+12% vs last week" */
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
  className?: string;
}

export function Stat({ label, value, delta, trend = 'flat', className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-sm text-sub">{label}</span>
      <span className="text-2xl font-bold tracking-tight text-ink">{value}</span>
      {delta && (
        <span
          className={cn(
            'text-sm font-semibold',
            trend === 'up' && 'text-ok',
            trend === 'down' && 'text-accent-text',
            trend === 'flat' && 'text-sub',
          )}
        >
          {delta}
        </span>
      )}
    </div>
  );
}
