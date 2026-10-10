import type { HTMLAttributes } from 'react';
import { cn } from '../cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'paper' | 'ai' | 'ink' | 'accent';
  padded?: boolean;
}

const tones = {
  paper: 'bg-paper text-ink border border-line',
  ai: 'bg-ai-soft text-ai',
  ink: 'bg-ink text-paper',
  accent: 'bg-accent-soft text-accent-text',
};

/** 22px radius on web, white with a 1px line border. */
export function Card({ tone = 'paper', padded = true, className, ...rest }: CardProps) {
  return <div className={cn('rounded-card', tones[tone], padded && 'p-5', className)} {...rest} />;
}
