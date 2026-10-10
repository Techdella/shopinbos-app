import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTokensCss, colors } from './index';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('tokens', () => {
  it('matches the spec palette', () => {
    expect(colors.ink).toBe('#16141F');
    expect(colors.accent).toBe('#FF6A2B');
    expect(colors.ai).toBe('#0C4A44');
  });

  it('committed tokens.css is up to date', () => {
    const file = readFileSync(fileURLToPath(new URL('../tokens.css', import.meta.url)), 'utf8');
    expect(file).toBe(buildTokensCss());
  });

  it.each([
    ['ink on canvas', colors.ink, colors.canvas],
    ['sub on paper', colors.sub, colors.paper],
    ['paper on ink', colors.paper, colors.ink],
    ['accent-text on accent-soft', colors['accent-text'], colors['accent-soft']],
    ['ai on ai-soft', colors.ai, colors['ai-soft']],
    ['ok on ok-soft', colors.ok, colors['ok-soft']],
    ['warn on warn-soft', colors.warn, colors['warn-soft']],
    ['info on info-soft', colors.info, colors['info-soft']],
  ])('%s meets 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
