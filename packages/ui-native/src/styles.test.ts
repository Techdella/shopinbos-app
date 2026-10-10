import { describe, expect, it } from 'vitest';
import { badgeColors, buttonColors, clamp } from './styles';

describe('native style helpers', () => {
  it('primary is ink, accent is orange', () => {
    expect(buttonColors('primary').bg).toBe('#16141F');
    expect(buttonColors('accent').bg).toBe('#FF6A2B');
    expect(buttonColors('ghost').border).toBe('#ECEAF2');
  });
  it('badge tones map to soft backgrounds', () => {
    expect(badgeColors('ok')).toEqual({ bg: '#E2F5EA', fg: '#16794A' });
  });
  it('clamps', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
