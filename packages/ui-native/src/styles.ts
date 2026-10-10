import { theme } from '@shopinbos/tokens';

export const t = theme;

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'ai';
export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'info' | 'accent' | 'ai' | 'ink';

const c = theme.colors;

export function buttonColors(variant: ButtonVariant): { bg: string; fg: string; border?: string } {
  switch (variant) {
    case 'accent':
      return { bg: c.accent, fg: c.ink };
    case 'ghost':
      return { bg: c.paper, fg: c.ink, border: c.line };
    case 'ai':
      return { bg: c.ai, fg: c.paper };
    default:
      return { bg: c.ink, fg: c.paper };
  }
}

export function badgeColors(tone: BadgeTone): { bg: string; fg: string } {
  switch (tone) {
    case 'ok':
      return { bg: c['ok-soft'], fg: c.ok };
    case 'warn':
      return { bg: c['warn-soft'], fg: c.warn };
    case 'info':
      return { bg: c['info-soft'], fg: c.info };
    case 'accent':
      return { bg: c['accent-soft'], fg: c['accent-text'] };
    case 'ai':
      return { bg: c['ai-soft'], fg: c.ai };
    case 'ink':
      return { bg: c.ink, fg: c.paper };
    default:
      return { bg: c.canvas, fg: c.sub };
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
