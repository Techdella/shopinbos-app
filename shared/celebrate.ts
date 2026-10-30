// Confetti for "Your store is live!" on the web (src/components/brand/Celebrate.tsx) and in the phone app
// (apps/mobile/src/components/Celebrate.tsx): the same pieces from a seed, so both look alike and tests can check them.

export const CONFETTI_COLORS = ["#73D8C8", "#F2A93B", "#E86A4F", "#2E7E78", "#6B4F8A", "#FFD25F", "#FF8FB1"];

export interface ConfettiPiece {
  /** Start across the screen, 0 (left) to 1 (right). */
  x: number;
  width: number;
  height: number;
  color: string;
  round: boolean;
  /** Seconds before it starts falling. */
  delay: number;
  /** Seconds to fall. */
  duration: number;
  /** Sideways drift in px by the bottom. */
  drift: number;
  /** Turns while falling, in degrees. */
  spin: number;
}

/** A small seeded random (mulberry32), so the confetti is the same on every render. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function confettiPieces(count: number, seed = 1): ConfettiPiece[] {
  const next = random(seed);
  return Array.from({ length: Math.max(0, Math.floor(count)) }, () => {
    const round = next() < 0.3;
    const width = round ? 8 + next() * 4 : 6 + next() * 6;
    return {
      x: next(),
      width,
      height: round ? width : 10 + next() * 8,
      color: CONFETTI_COLORS[Math.floor(next() * CONFETTI_COLORS.length)],
      round,
      delay: next() * 1.2,
      duration: 2.6 + next() * 1.6,
      drift: (next() - 0.5) * 160,
      spin: (next() < 0.5 ? -1 : 1) * (360 + next() * 540),
    };
  });
}
