"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { PopupArt as ArtId } from "@/lib/marketing/forms";

// Built-in pictures for pop-ups that don't have the seller's own picture yet: flat illustrations drawn as inline
// SVG in the pop-up's own colours (nothing is downloaded, so they work on any store and in the editor's
// previews). They fill their box like a cover photo.

export interface ArtColors {
  bg: string;
  ink: string;
  button: string;
  accent: string;
}

function rgb(color: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}

/** Mixes two #RRGGBB colours (t = 0 → a, 1 → b); anything else returns `a`. */
export function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v + (y[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function PopupArt({ art, colors, className, style, label }: { art: ArtId; colors: ArtColors; className?: string; style?: CSSProperties; label?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!art) return null;
  const { button, accent, ink } = colors;
  const light = mix(colors.bg, "#FFFFFF", 0.35);
  const soft = mix(button, "#FFFFFF", 0.78);
  const softer = mix(accent, "#FFFFFF", 0.82);
  const deep = mix(button, "#000000", 0.25);
  const g = (name: string) => `${uid}-${name}`;
  const scene = SCENES[art];
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={g("bg")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={soft} />
          <stop offset="1" stopColor={softer} />
        </linearGradient>
        <radialGradient id={g("glow")} cx="0.7" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("main")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={button} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${g("bg")})`} />
      <circle cx="300" cy="80" r="150" fill={`url(#${g("glow")})`} />
      {scene ? scene({ main: `url(#${g("main")})`, button, accent, ink, light, soft, deep, id: g }) : null}
    </svg>
  );
}

interface Paint {
  main: string;
  button: string;
  accent: string;
  ink: string;
  light: string;
  soft: string;
  deep: string;
  /** A document-unique id for a gradient or pattern (several pictures can be on one page). */
  id: (name: string) => string;
}

const sparkle = (x: number, y: number, r: number, fill: string) => (
  <path key={`sp${x}-${y}`} d={`M${x} ${y - r}C${x + r * 0.15} ${y - r * 0.15} ${x + r * 0.15} ${y - r * 0.15} ${x + r} ${y}C${x + r * 0.15} ${y + r * 0.15} ${x + r * 0.15} ${y + r * 0.15} ${x} ${y + r}C${x - r * 0.15} ${y + r * 0.15} ${x - r * 0.15} ${y + r * 0.15} ${x - r} ${y}C${x - r * 0.15} ${y - r * 0.15} ${x - r * 0.15} ${y - r * 0.15} ${x} ${y - r}Z`} fill={fill} />
);

const shadow = (cx: number, cy: number, rx: number) => <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.12} fill="#000" opacity="0.1" />;

const SCENES: Record<Exclude<ArtId, "">, (p: Paint) => ReactNode> = {
  bag: (p) => (
    <g>
      {shadow(200, 262, 95)}
      <path d="M160 92c0-26 18-44 40-44s40 18 40 44" fill="none" stroke={p.ink} strokeOpacity="0.55" strokeWidth="9" strokeLinecap="round" />
      <path d="M118 96h164l14 160H104z" fill={p.main} />
      <path d="M118 96h164l3 34H115z" fill="#FFFFFF" opacity="0.14" />
      <rect x="168" y="150" width="64" height="40" rx="8" fill={p.light} opacity="0.95" />
      <rect x="180" y="163" width="40" height="6" rx="3" fill={p.ink} opacity="0.35" />
      <rect x="186" y="174" width="28" height="5" rx="2.5" fill={p.ink} opacity="0.25" />
      <circle cx="160" cy="112" r="6" fill={p.ink} opacity="0.5" />
      <circle cx="240" cy="112" r="6" fill={p.ink} opacity="0.5" />
      <g transform="rotate(18 300 120)">
        <rect x="280" y="96" width="44" height="58" rx="8" fill={p.accent} />
        <circle cx="302" cy="110" r="5" fill={p.light} />
      </g>
      {sparkle(78, 70, 12, p.accent)}
      {sparkle(330, 220, 9, p.button)}
    </g>
  ),
  fashion: (p) => (
    <g>
      <circle cx="120" cy="110" r="64" fill={p.accent} opacity="0.55" />
      <path d="M200 40a12 12 0 1 1 12 12v8" fill="none" stroke={p.ink} strokeOpacity="0.6" strokeWidth="5" strokeLinecap="round" />
      <path d="M212 60 150 96h124z" fill="none" stroke={p.ink} strokeOpacity="0.6" strokeWidth="5" strokeLinejoin="round" />
      <path d="M182 96h60l-6 40 34 128H154l34-128z" fill={p.main} />
      <path d="M188 136h48" stroke={p.light} strokeWidth="6" opacity="0.8" />
      <path d="M196 170c10 8 22 8 32 0M180 210c20 10 44 10 64 0" fill="none" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="5" strokeLinecap="round" />
      <rect x="300" y="210" width="56" height="44" rx="10" fill={p.light} />
      <path d="M312 210c0-14 32-14 32 0" fill="none" stroke={p.accent} strokeWidth="5" />
      {sparkle(330, 76, 11, p.button)}
      {sparkle(70, 230, 8, p.ink)}
    </g>
  ),
  beauty: (p) => (
    <g>
      {shadow(200, 262, 110)}
      <rect x="176" y="70" width="48" height="30" rx="6" fill={p.accent} />
      <rect x="186" y="56" width="28" height="18" rx="4" fill={p.ink} opacity="0.7" />
      <rect x="140" y="98" width="120" height="160" rx="26" fill={p.main} />
      <rect x="152" y="110" width="22" height="130" rx="11" fill="#FFFFFF" opacity="0.18" />
      <rect x="170" y="160" width="60" height="44" rx="6" fill={p.light} opacity="0.92" />
      <rect x="182" y="176" width="36" height="5" rx="2.5" fill={p.ink} opacity="0.35" />
      <rect x="282" y="168" width="34" height="90" rx="8" fill={p.ink} opacity="0.75" />
      <path d="M286 168v-30l26-14v44z" fill={p.accent} />
      <circle cx="96" cy="210" r="34" fill={p.light} />
      <circle cx="96" cy="210" r="22" fill={p.accent} opacity="0.7" />
      {sparkle(330, 80, 12, p.accent)}
      {sparkle(90, 90, 9, p.button)}
    </g>
  ),
  food: (p) => (
    <g>
      {shadow(200, 254, 130)}
      <path d="M70 170h260c0 50-58 84-130 84S70 220 70 170z" fill={p.main} />
      <path d="M86 186c24 30 72 46 114 46" fill="none" stroke="#FFFFFF" strokeOpacity="0.2" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="200" cy="170" rx="130" ry="26" fill={p.light} />
      <ellipse cx="200" cy="166" rx="112" ry="20" fill={p.accent} />
      {[[150, 160], [180, 170], [210, 158], [240, 168], [262, 160], [130, 170], [196, 176]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 5 : 4} fill={i % 3 ? p.button : "#FFFFFF"} opacity={i % 3 ? 0.8 : 0.85} />
      ))}
      <path d="M232 150c10-16 30-22 46-10" fill="none" stroke="#3E8E41" strokeWidth="6" strokeLinecap="round" />
      {[160, 200, 240].map((x) => (
        <path key={x} d={`M${x} 120c-10-14 10-22 0-36s10-22 0-34`} fill="none" stroke={p.ink} strokeOpacity="0.25" strokeWidth="5" strokeLinecap="round" />
      ))}
      <rect x="318" y="96" width="12" height="96" rx="6" fill={p.ink} opacity="0.55" transform="rotate(20 324 144)" />
    </g>
  ),
  gift: (p) => (
    <g>
      {shadow(200, 262, 110)}
      <rect x="110" y="140" width="180" height="118" rx="10" fill={p.main} />
      <rect x="98" y="112" width="204" height="40" rx="10" fill={p.button} />
      <rect x="98" y="112" width="204" height="14" rx="7" fill="#FFFFFF" opacity="0.18" />
      <rect x="186" y="112" width="28" height="146" fill={p.accent} />
      <path d="M200 112c-30-6-58-34-36-50 18-12 32 18 36 50zM200 112c30-6 58-34 36-50-18-12-32 18-36 50z" fill={p.accent} />
      <circle cx="200" cy="110" r="10" fill={p.accent} stroke={p.light} strokeWidth="3" />
      {sparkle(80, 80, 14, p.accent)}
      {sparkle(330, 90, 10, p.button)}
      {sparkle(320, 230, 8, p.ink)}
      {[[70, 180], [340, 160], [120, 60], [280, 50]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="10" height="5" rx="2" fill={i % 2 ? p.accent : p.button} transform={`rotate(${i * 40} ${x} ${y})`} />
      ))}
    </g>
  ),
  fabric: (p) => (
    <g>
      <defs>
        <pattern id={p.id("ankara")} width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="80" height="80" fill={p.button} />
          <circle cx="40" cy="40" r="26" fill={p.accent} />
          <circle cx="40" cy="40" r="16" fill={p.light} />
          <circle cx="40" cy="40" r="7" fill={p.ink} opacity="0.7" />
          <path d="M0 0l16 16M80 0 64 16M0 80l16-16M80 80 64 64" stroke={p.light} strokeWidth="6" />
          <circle cx="0" cy="40" r="8" fill={p.light} opacity="0.85" />
          <circle cx="80" cy="40" r="8" fill={p.light} opacity="0.85" />
          <circle cx="40" cy="0" r="8" fill={p.deep} />
          <circle cx="40" cy="80" r="8" fill={p.deep} />
        </pattern>
      </defs>
      <rect width="400" height="300" fill={`url(#${p.id("ankara")})`} />
      <rect width="400" height="300" fill="#000" opacity="0.06" />
    </g>
  ),
  festive: (p) => (
    <g>
      <path d="M-10 40C80 90 170 100 260 70S380 30 420 50" fill="none" stroke={p.ink} strokeOpacity="0.35" strokeWidth="3" />
      {[30, 85, 140, 195, 250, 305, 360].map((x, i) => {
        const y = 40 + Math.sin((x / 400) * Math.PI * 1.6) * 30 + 16;
        return <circle key={x} cx={x} cy={y} r="9" fill={[p.button, p.accent, "#FFFFFF"][i % 3]} stroke={p.ink} strokeOpacity="0.2" />;
      })}
      {shadow(200, 268, 120)}
      <circle cx="140" cy="200" r="54" fill={p.main} />
      <circle cx="122" cy="182" r="14" fill="#FFFFFF" opacity="0.3" />
      <rect x="130" y="138" width="20" height="14" rx="3" fill={p.ink} opacity="0.6" />
      <circle cx="262" cy="210" r="44" fill={p.accent} />
      <path d="M222 210h80" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="6" />
      <rect x="254" y="158" width="16" height="12" rx="3" fill={p.ink} opacity="0.6" />
      {sparkle(330, 120, 12, p.accent)}
      {sparkle(60, 120, 10, p.button)}
    </g>
  ),
  crescent: (p) => (
    <g>
      <circle cx="160" cy="130" r="80" fill={p.accent} />
      <circle cx="196" cy="108" r="74" fill={p.light} />
      {sparkle(250, 90, 16, p.accent)}
      {sparkle(300, 150, 8, p.button)}
      {sparkle(90, 60, 7, p.button)}
      <path d="M300 160v-30" stroke={p.ink} strokeOpacity="0.5" strokeWidth="3" />
      <path d="M284 172h32l-6-12h-20z" fill={p.button} />
      <rect x="282" y="172" width="36" height="58" rx="10" fill={p.main} />
      <rect x="292" y="182" width="16" height="36" rx="8" fill={p.accent} opacity="0.85" />
      <path d="M286 230h28l4 10h-36z" fill={p.button} />
      <path d="M40 270c60-30 120-30 180 0s120 30 180 0v40H40z" fill={p.button} opacity="0.35" />
    </g>
  ),
  hearts: (p) => {
    const heart = (x: number, y: number, s: number, fill: string, key: string) => (
      <path key={key} transform={`translate(${x} ${y}) scale(${s})`} d="M0 30C-30 10-46-6-46-24c0-14 11-24 24-24 9 0 17 5 22 12 5-7 13-12 22-12 13 0 24 10 24 24 0 18-16 34-46 54z" fill={fill} />
    );
    return (
      <g>
        {heart(200, 150, 2.1, p.button, "a")}
        <path d="M150 112c6-14 20-22 34-18" fill="none" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="8" strokeLinecap="round" />
        {heart(320, 80, 0.7, p.accent, "b")}
        {heart(80, 220, 0.8, p.accent, "c")}
        {heart(330, 230, 0.45, p.button, "d")}
        {heart(70, 70, 0.4, p.button, "e")}
      </g>
    );
  },
  bolt: (p) => (
    <g>
      <circle cx="200" cy="150" r="96" fill={p.main} />
      <circle cx="200" cy="150" r="96" fill="none" stroke={p.accent} strokeWidth="8" strokeDasharray="10 14" />
      <path d="M212 74 156 162h40l-14 64 62-96h-42z" fill={p.accent} stroke={p.ink} strokeOpacity="0.2" strokeWidth="3" strokeLinejoin="round" />
      {[[40, 110, 70], [30, 150, 90], [50, 190, 60], [300, 110, 70], [310, 150, 90], [300, 190, 60]].map(([x, y, w], i) => (
        <rect key={i} x={x} y={y} width={w} height="7" rx="3.5" fill={p.ink} opacity="0.18" />
      ))}
    </g>
  ),
  truck: (p) => (
    <g>
      <path d="M0 250h400" stroke={p.ink} strokeOpacity="0.15" strokeWidth="4" />
      {[30, 50, 70].map((y, i) => (
        <rect key={y} x={20 + i * 12} y={140 + y} width={60 - i * 12} height="7" rx="3.5" fill={p.ink} opacity="0.18" />
      ))}
      <rect x="96" y="120" width="160" height="104" rx="12" fill={p.main} />
      <rect x="96" y="120" width="160" height="22" rx="11" fill="#FFFFFF" opacity="0.15" />
      <path d="M256 150h52l34 40v34H256z" fill={p.accent} />
      <path d="M268 160h36l22 28h-58z" fill={p.light} opacity="0.9" />
      <rect x="150" y="160" width="56" height="34" rx="6" fill={p.light} opacity="0.9" />
      <path d="M160 170h36M160 182h24" stroke={p.ink} strokeOpacity="0.35" strokeWidth="5" strokeLinecap="round" />
      {[140, 300].map((x) => (
        <g key={x}>
          <circle cx={x} cy="228" r="24" fill={p.ink} opacity="0.85" />
          <circle cx={x} cy="228" r="10" fill={p.light} />
        </g>
      ))}
      {sparkle(330, 80, 12, p.accent)}
    </g>
  ),
  book: (p) => (
    <g>
      {shadow(200, 262, 130)}
      <path d="M200 90c-34-14-78-16-114-6v164c36-10 80-8 114 6z" fill={p.light} />
      <path d="M200 90c34-14 78-16 114-6v164c-36-10-80-8-114 6z" fill="#FFFFFF" opacity="0.92" />
      <path d="M200 90v164" stroke={p.ink} strokeOpacity="0.25" strokeWidth="3" />
      {[120, 140, 160, 180, 200].map((y) => (
        <path key={y} d={`M106 ${y}c26-6 50-6 76 2`} fill="none" stroke={p.ink} strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" />
      ))}
      <rect x="222" y="112" width="70" height="56" rx="8" fill={p.main} />
      {[180, 198, 216].map((y) => (
        <path key={y} d={`M222 ${y}c24-4 46-4 70 2`} fill="none" stroke={p.ink} strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" />
      ))}
      <path d="M40 240h120" stroke={p.accent} strokeWidth="18" strokeLinecap="round" />
      {[52, 68, 84, 100, 116, 132, 148].map((x, i) => (
        <path key={x} d={`M${x} 232v${i % 2 ? 8 : 14}`} stroke={p.ink} strokeOpacity="0.45" strokeWidth="2.5" />
      ))}
      {sparkle(338, 70, 12, p.accent)}
    </g>
  ),
};
