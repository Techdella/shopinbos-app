import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'info' | 'accent' | 'ai' | 'ink';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-sub',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent-text',
  ai: 'bg-ai-soft text-ai',
  ink: 'bg-ink text-paper',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Status badge: Paid (ok), Pending (warn), Low stock (accent), Dropship (info), Peggy (ai). */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
