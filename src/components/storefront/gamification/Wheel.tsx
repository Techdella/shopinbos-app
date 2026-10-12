"use client";

import { textOn, type GameColors } from "./client";

// The prize wheel as an SVG: slice 0 is centred under the pointer at the top, the rest follow clockwise.
// `rotation` (degrees) is animated by the parent with a CSS transition, so the wheel itself stays static and
// cheap; with reduced motion the parent jumps straight to the end.

export interface WheelSlice {
  id: string;
  label: string;
}

/** Degrees to turn the wheel (from `current`) so `index` stops under the pointer after a few full turns. */
export function spinTarget(current: number, index: number, count: number, turns = 5, jitter = 0) {
  const seg = 360 / count;
  const land = (360 - index * seg + jitter * seg * 0.35) % 360;
  const base = current - (current % 360);
  return base + turns * 360 + land;
}

export function Wheel({ slices, colors, rotation = 0, size = 280, durationMs = 0, highlight = -1 }: { slices: WheelSlice[]; colors: GameColors; rotation?: number; size?: number; durationMs?: number; highlight?: number }) {
  const count = Math.max(1, slices.length);
  const seg = 360 / count;
  const r = 100;
  const fills = slices.map((_, index) => (count % 2 === 1 && index === count - 1 ? colors.accent : index % 2 === 0 ? colors.cta : colors.card));
  const point = (angle: number, radius = r) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return `${(radius * Math.cos(rad)).toFixed(3)} ${(radius * Math.sin(rad)).toFixed(3)}`;
  };
  const fontSize = count > 6 ? 8.5 : 10;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} aria-hidden>
      {/* Pointer */}
      <svg viewBox="0 0 24 24" width={30} height={30} className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2 drop-shadow" style={{ color: colors.ink }}>
        <path d="M12 22 4 6h16z" fill="currentColor" stroke={colors.paper} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <svg
        viewBox="-104 -104 208 208"
        width={size}
        height={size}
        style={{ transform: `rotate(${rotation}deg)`, transition: durationMs ? `transform ${durationMs}ms cubic-bezier(0.12, 0.7, 0.12, 1)` : undefined, willChange: durationMs ? "transform" : undefined }}
      >
        <circle r={103} fill={colors.ink} />
        {slices.map((slice, index) => {
          const start = index * seg - seg / 2;
          const end = start + seg;
          const fill = fills[index]!;
          const label = slice.label.length > 14 ? `${slice.label.slice(0, 13)}…` : slice.label;
          return (
            <g key={slice.id}>
              <path d={`M0 0 L${point(start)} A${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${point(end)} Z`} fill={fill} stroke={colors.ink} strokeOpacity={0.18} strokeWidth={0.8} opacity={highlight >= 0 && highlight !== index ? 0.55 : 1} />
              <g transform={`rotate(${index * seg})`}>
                <text x={0} y={-r * 0.6} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={700} fill={textOn(fill)} style={{ fontFamily: "inherit" }}>
                  {label}
                </text>
              </g>
            </g>
          );
        })}
        <circle r={15} fill={colors.paper} stroke={colors.ink} strokeWidth={3} />
        <circle r={5} fill={colors.cta} />
      </svg>
    </div>
  );
}

/** A burst of falling confetti for a win. Pure CSS; nothing at all with reduced motion. */
export function Confetti({ colors, pieces = 70 }: { colors: string[]; pieces?: number }) {
  const bits = Array.from({ length: pieces }, (_, i) => {
    const left = (i * 37) % 100;
    const delay = (i % 10) * 0.06;
    const duration = 1.6 + ((i * 13) % 10) / 10;
    const rotate = (i * 47) % 360;
    return { left, delay, duration, rotate, color: colors[i % colors.length]!, wide: i % 3 === 0 };
  });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
      <style>{`@keyframes sib-confetti{0%{transform:translate3d(0,-20px,0) rotate(0)}100%{transform:translate3d(0,560px,0) rotate(720deg);opacity:0}}`}</style>
      {bits.map((bit, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-[2px]"
          style={{ left: `${bit.left}%`, width: bit.wide ? 10 : 6, height: bit.wide ? 6 : 10, background: bit.color, transform: `rotate(${bit.rotate}deg)`, animation: `sib-confetti ${bit.duration}s ${bit.delay}s cubic-bezier(.2,.6,.4,1) forwards` }}
        />
      ))}
    </div>
  );
}
