"use client";

import { useMemo, type CSSProperties } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { confettiPieces } from "@shared/celebrate";

// "Your store is live!": confetti falls once over the whole screen and Rex dances (CSS in globals.css; both stay
// still under reduced motion). The phone app has the same pair in apps/mobile/src/components/Celebrate.tsx.

/** Confetti over the whole screen, once. Decorative: hidden from screen readers and never in the way of a tap. */
export function Confetti({ count = 90, seed = 1 }: { count?: number; seed?: number }) {
  const pieces = useMemo(() => confettiPieces(count, seed), [count, seed]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{
            left: `${piece.x * 100}%`,
            width: piece.width,
            height: piece.height,
            background: piece.color,
            borderRadius: piece.round ? 999 : 2,
            "--confetti-delay": `${piece.delay}s`,
            "--confetti-time": `${piece.duration}s`,
            "--confetti-drift": `${piece.drift}px`,
            "--confetti-spin": `${piece.spin}deg`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Rex celebrating, with a little dance on top of his animation. */
export function DancingRex({ size = 150, className }: { size?: number; className?: string }) {
  return (
    <span className={className}>
      <span className="rex-dance inline-block">
        <Mascot who="rex" mood="celebrate" size={size} decorative />
      </span>
    </span>
  );
}
