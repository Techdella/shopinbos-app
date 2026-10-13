"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { IntroScene, SceneArt } from "@shared/feature-intros";

// The motion-graphics kit for the 60-second feature intros: one small inline-SVG illustration per scene art
// (shared/feature-intros.ts SCENE_ARTS), animated with CSS keyframes (INTRO_CSS). Every element's resting style is
// its finished look, so with reduced motion (animations off) each scene is a clean still frame. Everything is
// drawn in a 360×220 box on the navy stage.

export const C = {
  navy: "#0E2A38",
  deep: "#0A2230",
  panel: "#143A4C",
  line: "#24546A",
  mint: "#73D8C8",
  mintSoft: "#B5EBE2",
  cream: "#F4F1EA",
  amber: "#F2A93B",
  coral: "#E86A4F",
  teal: "#2E7E78",
  plum: "#A88BCB",
  whatsapp: "#25D366",
} as const;

const FONT = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";
const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";

/** All keyframes and the pause / still-frame switches, scoped to .fi-stage. */
export const INTRO_CSS = `
.fi-stage .fi { transform-box: fill-box; transform-origin: center; animation-duration: .7s; animation-timing-function: cubic-bezier(.2,.8,.2,1); animation-fill-mode: both; }
.fi-stage .fi-pop { animation-name: fi-pop; }
.fi-stage .fi-rise { animation-name: fi-rise; }
.fi-stage .fi-fade { animation-name: fi-fade; }
.fi-stage .fi-draw { stroke-dasharray: 1; stroke-dashoffset: 0; animation-name: fi-draw; animation-duration: 1.4s; animation-timing-function: ease-in-out; }
.fi-stage .fi-grow { transform-origin: bottom; animation-name: fi-grow; animation-duration: .9s; }
.fi-stage .fi-growx { transform-origin: left; animation-name: fi-growx; animation-duration: .9s; }
.fi-stage .fi-move { animation-name: fi-move; animation-duration: 1.1s; animation-timing-function: cubic-bezier(.5,0,.2,1); }
.fi-stage .fi-fly { transform: translate(var(--dx), var(--dy)); animation-name: fi-fly; animation-duration: 1s; }
.fi-stage .fi-lit { animation-name: fi-lit; animation-duration: .5s; }
.fi-stage .fi-float { animation: fi-float 3s ease-in-out infinite; }
.fi-stage .fi-pulse { animation: fi-pulse 1.8s ease-in-out infinite; }
.fi-stage .fi-ring { opacity: 0; animation: fi-ring 2s ease-out infinite; }
.fi-stage .fi-loop { transform: translate(calc(var(--dx) * .5), calc(var(--dy) * .5)); animation: fi-loop 2.4s ease-in-out infinite; }
.fi-stage .fi-ride { offset-rotate: 0deg; animation: fi-ride 5s ease-in-out infinite; }
.fi-stage .fi-blink { animation: fi-blink 1s steps(1) infinite; }
.fi-stage .fi-cycle { animation: fi-cycle 7.5s ease-in-out infinite; }
@keyframes fi-pop { 0% { transform: scale(0); opacity: 0; } 65% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); } }
@keyframes fi-rise { from { transform: translateY(14px); opacity: 0; } }
@keyframes fi-fade { from { opacity: 0; } }
@keyframes fi-draw { from { stroke-dashoffset: 1; } }
@keyframes fi-grow { from { transform: scaleY(0); } }
@keyframes fi-growx { from { transform: scaleX(0); } }
@keyframes fi-move { from { transform: translate(var(--dx), var(--dy)); } }
@keyframes fi-fly { from { transform: translate(0, 0) scale(.4); opacity: 0; } 30% { opacity: 1; } }
@keyframes fi-lit { from { fill: ${C.panel}; stroke: ${C.line}; color: ${C.cream}; } }
@keyframes fi-float { 50% { transform: translateY(-5px); } }
@keyframes fi-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
@keyframes fi-ring { from { transform: scale(.7); opacity: .7; } to { transform: scale(2.1); opacity: 0; } }
@keyframes fi-loop { 0% { transform: translate(0, 0); opacity: 0; } 12% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)); opacity: 0; } }
@keyframes fi-ride { 0% { offset-distance: 0%; } 80%, 100% { offset-distance: 100%; } }
@keyframes fi-blink { 50% { opacity: 0; } }
@keyframes fi-cycle { 0%, 28% { opacity: 1; } 33%, 95% { opacity: 0; } 100% { opacity: 1; } }
.fi-stage[data-paused="true"] *, .fi-stage[data-paused="true"] *::before { animation-play-state: paused !important; }
.fi-stage[data-still="true"] * { animation: none !important; }
@media (prefers-reduced-motion: reduce) { .fi-stage * { animation: none !important; } }
`;

/** className + delay for one animated element. */
function a(kind: string, delay = 0, style?: CSSProperties): { className: string; style: CSSProperties } {
  return { className: `fi fi-${kind}`, style: { animationDelay: `${delay}s`, ...style } };
}
const v = (dx: number, dy: number) => ({ ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` }) as CSSProperties;

export interface SceneProps {
  scene: IntroScene;
  paused: boolean;
  still: boolean;
}

// ─── Small JS-driven bits (typing and counting); everything else is CSS ───

function useTicker(total: number, stepMs: number, startMs: number, paused: boolean, still: boolean) {
  const [step, setStep] = useState(still ? total : 0);
  useEffect(() => {
    if (still) {
      setStep(total);
      return;
    }
    if (paused || step >= total) return;
    const timer = window.setTimeout(() => setStep((current) => Math.min(total, current + 1)), step === 0 ? startMs : stepMs);
    return () => window.clearTimeout(timer);
  }, [step, total, stepMs, startMs, paused, still]);
  return step;
}

function Typed({ text, x, y, delayMs, paused, still, size = 13, color = C.cream, cursor = C.mint }: { text: string; x: number; y: number; delayMs: number; paused: boolean; still: boolean; size?: number; color?: string; cursor?: string }) {
  const shown = useTicker(text.length, 85, delayMs, paused, still);
  return (
    <text x={x} y={y} fill={color} fontSize={size} fontWeight={600} fontFamily={MONO}>
      {text.slice(0, shown)}
      <tspan className="fi-blink" fill={cursor}>▍</tspan>
    </text>
  );
}

/** Counts from `from` to the number in `value` ("₦64,000", "12", "3%"), keeping its prefix and suffix. */
function Counter({ value, from, x, y, size, delayMs, paused, still, anchor = "start", color = C.cream }: { value: string; from?: number; x: number; y: number; size: number; delayMs: number; paused: boolean; still: boolean; anchor?: "start" | "middle" | "end"; color?: string }) {
  const match = value.match(/^(\D*)([\d,.]+)(.*)$/);
  const target = match ? Number(match[2]!.replace(/,/g, "")) : 0;
  const steps = 18;
  const step = useTicker(match ? steps : 0, 55, delayMs, paused, still);
  let text = value;
  if (match && Number.isFinite(target)) {
    const start = from ?? 0;
    const now = Math.round(start + ((target - start) * step) / steps);
    text = `${match[1]}${now.toLocaleString("en-NG")}${match[3]}`;
  }
  return (
    <text x={x} y={y} fill={color} fontSize={size} fontWeight={800} fontFamily={FONT} textAnchor={anchor} style={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </text>
  );
}

function Chip({ x, y, text, fill = C.panel, color = C.cream, delay = 0, kind = "rise", anchor = "middle", size = 11 }: { x: number; y: number; text: string; fill?: string; color?: string; delay?: number; kind?: string; anchor?: "middle" | "start"; size?: number }) {
  const width = Math.max(34, text.length * size * 0.58 + 20);
  const left = anchor === "middle" ? x - width / 2 : x;
  return (
    <g {...a(kind, delay)}>
      <rect x={left} y={y - 11} width={width} height={22} rx={11} fill={fill} />
      <text x={left + width / 2} y={y + 4} fill={color} fontSize={size} fontWeight={700} fontFamily={FONT} textAnchor="middle">{text}</text>
    </g>
  );
}

function Phone({ x, y, w = 96, h = 176, children }: { x: number; y: number; w?: number; h?: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={16} fill={C.deep} stroke={C.line} strokeWidth={2} />
      <rect x={x + w / 2 - 14} y={y + 6} width={28} height={4} rx={2} fill={C.line} />
      {children}
    </g>
  );
}

const DOT_COLORS = [C.mint, C.amber, C.coral, C.plum, C.mintSoft];

/** Deterministic scatter for the dots. */
function rand(seed: number) {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
}

// ─── The scenes ───

function PhoneStore({ scene, paused, still }: SceneProps) {
  const chips = scene.chips ?? [];
  return (
    <g>
      <Phone x={132} y={22}>
        <rect x={142} y={38} width={76} height={14} rx={7} fill={C.panel} />
        <circle cx={150} cy={45} r={4} fill={C.mint} />
        {scene.label ? (
          <g {...a("pop", 0.5)}>
            <rect x={140} y={58} width={80} height={26} rx={8} fill={C.mint} />
            <text x={180} y={75} fill={C.navy} fontSize={9.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{scene.label.slice(0, 16)}</text>
          </g>
        ) : (
          <rect {...a("fade", 0.4)} x={140} y={58} width={80} height={26} rx={8} fill={C.teal} />
        )}
        {[0, 1, 2, 3].map((i) => (
          <g key={i} {...a("pop", 0.9 + i * 0.25)}>
            <rect x={140 + (i % 2) * 42} y={92 + Math.floor(i / 2) * 44} width={38} height={38} rx={8} fill={C.panel} />
            <rect x={148 + (i % 2) * 42} y={100 + Math.floor(i / 2) * 44} width={22} height={14} rx={4} fill={DOT_COLORS[i]} opacity={0.85} />
            <rect x={146 + (i % 2) * 42} y={119 + Math.floor(i / 2) * 44} width={18} height={4} rx={2} fill={C.line} />
          </g>
        ))}
        <g {...a("rise", 2.2)}>
          <rect x={140} y={180} width={80} height={10} rx={5} fill={C.amber} />
        </g>
      </Phone>
      {scene.value && (
        <g {...a("pop", 2.6)}>
          <rect x={232} y={150} width={106} height={42} rx={14} fill={C.cream} />
          <text x={246} y={166} fill={C.teal} fontSize={9} fontWeight={700} fontFamily={MONO}>PAID</text>
          <Counter value={scene.value} x={246} y={184} size={15} delayMs={2900} paused={paused} still={still} color={C.navy} />
        </g>
      )}
      {chips.map((chip, i) => (
        <g key={chip} className="fi-float" style={{ animationDelay: `${i * 0.5}s` }}>
          <Chip x={i % 2 ? 290 : 70} y={50 + i * 46} text={chip} fill={i === 0 ? C.whatsapp : i === 1 ? C.plum : C.coral} color={C.navy} delay={1.2 + i * 0.4} kind="pop" />
        </g>
      ))}
    </g>
  );
}

function DotsSort({ scene }: SceneProps) {
  const groups = scene.chips?.length ? scene.chips.slice(0, 3) : ["Everyone"];
  const n = groups.length;
  const centers = groups.map((_, i) => ({ x: n === 1 ? 180 : 70 + (220 / (n - 1)) * i, y: 100 }));
  const dots = Array.from({ length: 21 }, (_, i) => {
    const group = i % n;
    const k = Math.floor(i / n);
    const ring = n === 1 ? 7 : Math.ceil(21 / n);
    const angle = (k / ring) * Math.PI * 2 + group;
    const radius = n === 1 ? 18 + (i % 3) * 16 : 12 + (k % 2) * 16;
    const fx = centers[group]!.x + Math.cos(angle) * radius;
    const fy = centers[group]!.y + Math.sin(angle) * radius * 0.85;
    const sx = 20 + rand(i + 1) * 320;
    const sy = 20 + rand(i + 50) * 170;
    return { fx, fy, dx: sx - fx, dy: sy - fy, color: n === 1 ? DOT_COLORS[i % 4]! : DOT_COLORS[group]!, delay: 0.5 + rand(i + 9) * 1.4 };
  });
  return (
    <g>
      {centers.map((center, i) => (
        <ellipse key={i} {...a("pop", 1.6 + i * 0.2)} cx={center.x} cy={center.y} rx={n === 1 ? 72 : 50} ry={n === 1 ? 62 : 44} fill={C.panel} stroke={DOT_COLORS[n === 1 ? 0 : i]} strokeOpacity={0.5} strokeDasharray="4 5" />
      ))}
      {dots.map((dot, i) => (
        <g key={i} transform={`translate(${dot.fx} ${dot.fy})`}>
          <circle {...a("move", dot.delay, v(dot.dx, dot.dy))} r={7} fill={dot.color} />
        </g>
      ))}
      {groups.map((group, i) => (
        <Chip key={group} x={centers[i]!.x} y={190} text={group} fill={n === 1 ? C.mint : DOT_COLORS[i]} color={C.navy} delay={2.6 + i * 0.25} />
      ))}
    </g>
  );
}

function ChatBubbles({ scene, paused, still }: SceneProps) {
  const label = scene.label ?? "Thank you!";
  const bubbles = [
    { me: false, w: 120, y: 34 },
    { me: true, w: 96, y: 70 },
    { me: false, w: 84, y: 106 },
  ];
  return (
    <g>
      <rect x={70} y={14} width={220} height={196} rx={20} fill={C.deep} stroke={C.line} strokeWidth={2} />
      {bubbles.map((bubble, i) => (
        <g key={i} {...a("pop", 0.4 + i * 0.6)}>
          <rect x={bubble.me ? 278 - bubble.w : 82} y={bubble.y} width={bubble.w} height={26} rx={12} fill={bubble.me ? C.teal : C.panel} />
          <rect x={(bubble.me ? 278 - bubble.w : 82) + 12} y={bubble.y + 11} width={bubble.w - 30} height={4} rx={2} fill={C.cream} opacity={0.45} />
        </g>
      ))}
      <g {...a("fade", 2.2)}>
        {[0, 1, 2].map((i) => (
          <circle key={i} className="fi-pulse" style={{ animationDelay: `${i * 0.2}s` }} cx={96 + i * 10} cy={152} r={3.5} fill={C.mint} />
        ))}
      </g>
      <g {...a("pop", 3.4)}>
        <rect x={82} y={140} width={196} height={50} rx={16} fill={C.mint} />
        <Typed text={label.slice(0, 24)} x={96} y={170} delayMs={3800} paused={paused} still={still} size={12} color={C.navy} cursor={C.teal} />
      </g>
    </g>
  );
}

function SendBurst({ scene }: SceneProps) {
  const targets = [
    { dx: -110, dy: -50, color: C.amber, label: "Email" },
    { dx: 110, dy: -50, color: C.whatsapp, label: "WhatsApp" },
    { dx: 0, dy: 70, color: C.plum, label: "SMS" },
  ];
  return (
    <g>
      <g transform="translate(180 100)">
        <circle className="fi-ring" cx={0} cy={0} r={30} fill="none" stroke={C.mint} strokeWidth={2} />
        <g {...a("pop", 0.2)}>
          <rect x={-34} y={-24} width={68} height={48} rx={10} fill={C.cream} />
          <path d="M-34 -18 L0 6 L34 -18" fill="none" stroke={C.navy} strokeWidth={3} strokeLinejoin="round" />
        </g>
        {targets.map((target, i) => (
          <g key={target.label}>
            <line {...a("draw", 1 + i * 0.2)} pathLength={1} x1={0} y1={0} x2={target.dx} y2={target.dy} stroke={target.color} strokeWidth={2} strokeDasharray="1" opacity={0.6} />
            <g {...a("fly", 1.1 + i * 0.25, v(target.dx, target.dy))}>
              <circle r={20} fill={target.color} />
              <text y={4} fill={C.navy} fontSize={9} fontWeight={800} fontFamily={FONT} textAnchor="middle">{target.label}</text>
            </g>
          </g>
        ))}
      </g>
      {[[40, 30], [60, 70], [300, 30], [320, 70], [150, 200], [210, 200]].map(([x, y], i) => (
        <circle key={i} {...a("pop", 2.4 + i * 0.15)} cx={x} cy={y} r={6} fill={DOT_COLORS[i % 4]} />
      ))}
      {scene.label && <Chip x={180} y={20} text={scene.label} fill={C.mint} color={C.navy} delay={0.6} />}
    </g>
  );
}

function ChartGrow({ scene, paused, still }: SceneProps) {
  const bars = [38, 52, 46, 70, 88, 120];
  return (
    <g>
      <line x1={50} y1={180} x2={320} y2={180} stroke={C.line} strokeWidth={2} />
      {bars.map((height, i) => (
        <rect key={i} {...a("grow", 0.3 + i * 0.18)} x={64 + i * 42} y={180 - height} width={26} height={height} rx={6} fill={i === bars.length - 1 ? C.mint : C.teal} />
      ))}
      <path {...a("draw", 1.6)} pathLength={1} d="M77 130 L119 118 L161 124 L203 96 L245 78 L287 44" fill="none" stroke={C.amber} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <circle className="fi-pulse" cx={287} cy={44} r={6} fill={C.amber} />
      <circle className="fi-ring" cx={287} cy={44} r={8} fill="none" stroke={C.amber} strokeWidth={2} />
      {scene.value && (
        <g {...a("rise", 2.4)}>
          <rect x={52} y={22} width={130} height={44} rx={14} fill={C.cream} />
          <Counter value={scene.value} x={66} y={52} size={20} delayMs={2600} paused={paused} still={still} color={C.navy} />
        </g>
      )}
    </g>
  );
}

function MoneyFlow({ scene, paused, still }: SceneProps) {
  return (
    <g>
      <g {...a("pop", 0.2)}>
        <rect x={34} y={60} width={92} height={92} rx={18} fill={C.panel} />
        <circle cx={80} cy={98} r={22} fill={C.amber} />
        <text x={80} y={105} fill={C.navy} fontSize={20} fontWeight={800} fontFamily={FONT} textAnchor="middle">₦</text>
        <rect x={56} y={130} width={48} height={6} rx={3} fill={C.line} />
      </g>
      <path {...a("draw", 0.6)} pathLength={1} d="M130 106 C 180 60, 200 150, 246 106" fill="none" stroke={C.line} strokeWidth={2} strokeDasharray="1" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform="translate(130 106)">
          <circle className="fi-loop" style={{ ...v(116, 0), animationDelay: `${1 + i * 0.6}s` }} r={8} fill={C.amber} stroke={C.navy} strokeWidth={2} />
        </g>
      ))}
      <g {...a("pop", 0.8)}>
        <path d="M250 82 L292 60 L334 82 Z" fill={C.mint} />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={258 + i * 20} y={88} width={8} height={44} rx={2} fill={C.mint} />)}
        <rect x={250} y={136} width={84} height={10} rx={3} fill={C.mint} />
      </g>
      {scene.value && (
        <g {...a("rise", 2.2)}>
          <Counter value={scene.value} x={292} y={176} size={17} delayMs={2400} paused={paused} still={still} anchor="middle" />
        </g>
      )}
      {scene.label && <text {...a("fade", 2.6)} x={292} y={198} fill={C.mintSoft} fontSize={10.5} fontFamily={MONO} textAnchor="middle">{scene.label}</text>}
    </g>
  );
}

function StoreCard({ scene }: SceneProps) {
  const name = scene.label ?? "Your shop";
  return (
    <g>
      <g {...a("rise", 0.2)}>
        <rect x={40} y={18} width={280} height={186} rx={18} fill={C.cream} />
        <rect x={40} y={18} width={280} height={30} rx={18} fill={C.mintSoft} />
        <rect x={40} y={34} width={280} height={14} fill={C.mintSoft} />
        <circle cx={60} cy={33} r={8} fill={C.teal} />
        <text x={76} y={37} fill={C.navy} fontSize={11.5} fontWeight={800} fontFamily={FONT}>{name.slice(0, 28)}</text>
      </g>
      <rect {...a("growx", 0.6)} x={56} y={58} width={248} height={40} rx={10} fill={C.teal} />
      <text {...a("fade", 1)} x={70} y={83} fill={C.cream} fontSize={12} fontWeight={800} fontFamily={FONT}>New in · Shop now</text>
      {[0, 1, 2].map((i) => (
        <g key={i} {...a("pop", 1.2 + i * 0.3)}>
          <rect x={56 + i * 84} y={108} width={76} height={80} rx={10} fill="#FFFFFF" stroke="#E8E2D5" />
          <rect x={64 + i * 84} y={116} width={60} height={38} rx={6} fill={[C.amber, C.coral, C.plum][i]} opacity={0.85} />
          <rect x={64 + i * 84} y={162} width={40} height={5} rx={2.5} fill="#C9C6D3" />
          <text x={64 + i * 84} y={180} fill={C.navy} fontSize={10} fontWeight={800} fontFamily={FONT}>₦{[15, 9, 22][i]},000</text>
        </g>
      ))}
      <g className="fi-pulse" style={{ animationDelay: "2.4s" }}>
        <circle {...a("pop", 2.2)} cx={302} cy={186} r={14} fill={C.mint} />
        <path {...a("fade", 2.4)} d="M296 186 h12 M302 180 v12" stroke={C.navy} strokeWidth={2.5} strokeLinecap="round" />
      </g>
    </g>
  );
}

function ProductStock({ scene, paused, still }: SceneProps) {
  const chips = scene.chips ?? [];
  const value = scene.value ?? "12";
  const target = Number(value.replace(/\D/g, "")) || 12;
  return (
    <g>
      <g {...a("rise", 0.2)}>
        <rect x={60} y={20} width={150} height={184} rx={18} fill={C.cream} />
        <rect x={74} y={34} width={122} height={84} rx={12} fill={C.mintSoft} />
        <path d="M110 64 h50 l6 42 h-62 Z" fill={C.teal} />
        <path d="M120 64 c0 -16 30 -16 30 0" fill="none" stroke={C.navy} strokeWidth={3} />
        <text x={74} y={138} fill={C.navy} fontSize={12} fontWeight={800} fontFamily={FONT}>{(scene.label ?? "Product").slice(0, 18)}</text>
      </g>
      {chips.map((chip, i) => (
        <g key={chip} {...a("pop", 1 + i * 0.2)}>
          <rect x={74 + i * 38} y={150} width={32} height={22} rx={11} fill={i === 1 ? C.navy : "#FFFFFF"} stroke={C.navy} strokeOpacity={0.2} />
          <text x={90 + i * 38} y={165} fill={i === 1 ? C.cream : C.navy} fontSize={10} fontWeight={800} fontFamily={FONT} textAnchor="middle">{chip}</text>
        </g>
      ))}
      {!chips.length && <rect {...a("growx", 1)} x={74} y={152} width={110} height={8} rx={4} fill="#E8E2D5" />}
      <g {...a("pop", 1.4)}>
        <rect x={226} y={50} width={100} height={80} rx={16} fill={C.panel} stroke={C.line} />
        <text x={276} y={74} fill={C.mintSoft} fontSize={9.5} fontFamily={MONO} textAnchor="middle">IN STOCK</text>
        <Counter value={String(target)} from={target + 9} x={276} y={114} size={34} delayMs={1800} paused={paused} still={still} anchor="middle" color={target <= 3 ? C.amber : C.cream} />
      </g>
      {target <= 5 ? <Chip x={276} y={156} text="Low stock" fill={C.amber} color={C.navy} delay={3} kind="pop" /> : <Chip x={276} y={156} text="Updated" fill={C.mint} color={C.navy} delay={3} kind="pop" />}
    </g>
  );
}

const ROUTE = "M60 170 C 110 170, 110 60, 180 90 S 260 50, 300 50";

function BikeRoute({ scene }: SceneProps) {
  return (
    <g>
      {[50, 100, 150].map((y) => <line key={y} x1={20} y1={y} x2={340} y2={y} stroke={C.panel} strokeWidth={10} strokeLinecap="round" />)}
      {[90, 180, 270].map((x) => <line key={x} x1={x} y1={20} x2={x} y2={200} stroke={C.panel} strokeWidth={10} strokeLinecap="round" />)}
      <path {...a("draw", 0.4)} pathLength={1} d={ROUTE} fill="none" stroke={C.mint} strokeWidth={3} strokeDasharray="1" strokeLinecap="round" />
      <g {...a("pop", 0.2)}>
        <circle cx={60} cy={170} r={10} fill={C.amber} />
        <circle cx={60} cy={170} r={4} fill={C.navy} />
      </g>
      <g {...a("pop", 1.4)}>
        <path d="M300 62 c-12 -14 -12 -30 0 -30 s12 16 0 30 Z" fill={C.coral} transform="translate(0 -6)" />
        <circle cx={300} cy={36} r={4} fill={C.navy} />
        <circle className="fi-ring" cx={300} cy={50} r={10} fill="none" stroke={C.coral} strokeWidth={2} />
      </g>
      <g className="fi-ride" style={{ offsetPath: `path("${ROUTE}")`, animationDelay: "1.6s" } as CSSProperties}>
        <g transform="translate(-14 -16)">
          <circle cx={6} cy={22} r={5} fill="none" stroke={C.cream} strokeWidth={2.5} />
          <circle cx={24} cy={22} r={5} fill="none" stroke={C.cream} strokeWidth={2.5} />
          <path d="M6 22 L13 12 L22 12 L24 22 M13 12 L11 6" fill="none" stroke={C.cream} strokeWidth={2.5} strokeLinecap="round" />
          <rect x={14} y={2} width={12} height={9} rx={2} fill={C.amber} />
        </g>
      </g>
      {scene.label && <Chip x={180} y={196} text={scene.label} fill={C.cream} color={C.navy} delay={0.8} />}
    </g>
  );
}

function DomainType({ scene, paused, still }: SceneProps) {
  const domain = scene.label ?? "yourshop.com";
  const typingDone = 1200 + domain.length * 85;
  return (
    <g>
      <g {...a("rise", 0.1)}>
        <rect x={30} y={22} width={300} height={180} rx={16} fill={C.cream} />
        <rect x={30} y={22} width={300} height={44} rx={16} fill={C.panel} />
        <rect x={30} y={50} width={300} height={16} fill={C.panel} />
        {[0, 1, 2].map((i) => <circle key={i} cx={48 + i * 12} cy={36} r={4} fill={[C.coral, C.amber, C.mint][i]} />)}
        <rect x={90} y={28} width={226} height={30} rx={15} fill={C.deep} />
        <path d="M104 44 v-4 a5 5 0 0 1 10 0 v4" fill="none" stroke={C.mint} strokeWidth={2} />
        <rect x={101} y={43} width={16} height={10} rx={2.5} fill={C.mint} />
      </g>
      <Typed text={domain} x={124} y={48} delayMs={1200} paused={paused} still={still} size={12.5} />
      <g {...a("fade", typingDone / 1000 + 0.3)}>
        <rect x={50} y={82} width={260} height={40} rx={10} fill={C.teal} />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={50 + i * 67} y={132} width={58} height={52} rx={8} fill={[C.mintSoft, "#E8E2D5", C.mintSoft, "#E8E2D5"][i]} />)}
      </g>
      <Chip x={268} y={102} text="Secure ✓" fill={C.mint} color={C.navy} delay={typingDone / 1000 + 0.8} kind="pop" />
    </g>
  );
}

function SupplierShip({ scene }: SceneProps) {
  return (
    <g>
      <g {...a("pop", 0.2)}>
        <path d="M30 100 L80 70 L130 100 V170 H30 Z" fill={C.panel} stroke={C.line} strokeWidth={2} />
        <rect x={60} y={124} width={40} height={46} rx={4} fill={C.deep} />
        {[0, 1, 2].map((i) => <line key={i} x1={62} y1={132 + i * 12} x2={98} y2={132 + i * 12} stroke={C.line} strokeWidth={2} />)}
        <text x={80} y={192} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">SUPPLIER</text>
      </g>
      <line {...a("draw", 0.6)} pathLength={1} x1={136} y1={150} x2={236} y2={150} stroke={C.mint} strokeWidth={3} strokeDasharray="1" strokeLinecap="round" />
      <g transform="translate(140 132)">
        <g className="fi-loop" style={{ ...v(86, 0), animationDuration: "3s", animationDelay: "1.2s" }}>
          <rect x={0} y={0} width={26} height={22} rx={3} fill={C.amber} />
          <path d="M0 7 H26 M13 0 V7" stroke={C.navy} strokeWidth={2} />
        </g>
      </g>
      <g {...a("pop", 1)}>
        <path d="M250 112 L290 82 L330 112 V170 H250 Z" fill={C.cream} />
        <rect x={280} y={134} width={20} height={36} rx={3} fill={C.teal} />
        <circle cx={295} cy={152} r={2} fill={C.cream} />
        <text x={290} y={192} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">CUSTOMER</text>
      </g>
      <g {...a("pop", 3)}>
        <circle cx={318} cy={88} r={12} fill={C.mint} />
        <path d="M312 88 l4 4 l8 -8" fill="none" stroke={C.navy} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {scene.label && <Chip x={180} y={40} text={scene.label} fill={C.cream} color={C.navy} delay={0.5} />}
    </g>
  );
}

function FlowNodes({ scene }: SceneProps) {
  const steps = (scene.chips?.length ? scene.chips : ["When", "Wait", "Send"]).slice(0, 3);
  const x = (i: number) => 22 + i * 116;
  return (
    <g>
      {steps.slice(1).map((_, i) => (
        <line key={i} {...a("draw", 0.8 + i * 1.3)} pathLength={1} x1={x(i) + 100} y1={110} x2={x(i + 1)} y2={110} stroke={C.mint} strokeWidth={3} strokeDasharray="1" />
      ))}
      {steps.map((step, i) => (
        <g key={step}>
          <g {...a("rise", 0.1 + i * 0.15)}>
            <rect className="fi fi-lit" style={{ animationDelay: `${0.5 + i * 1.3}s` }} x={x(i)} y={84} width={100} height={52} rx={14} fill={i === steps.length - 1 ? C.mint : C.teal} stroke={C.mint} strokeWidth={2} />
          </g>
          <text {...a("fade", 0.5 + i * 1.3)} x={x(i) + 50} y={115} fill={i === steps.length - 1 ? C.navy : C.cream} fontSize={11} fontWeight={800} fontFamily={FONT} textAnchor="middle">{step}</text>
          <g {...a("pop", 0.7 + i * 1.3)}>
            <circle cx={x(i) + 50} cy={64} r={11} fill={C.amber} />
            <text x={x(i) + 50} y={68} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{i + 1}</text>
          </g>
        </g>
      ))}
      <circle className="fi-ring" style={{ animationDelay: "3.6s" }} cx={x(steps.length - 1) + 50} cy={110} r={30} fill="none" stroke={C.mint} strokeWidth={2} />
      <text {...a("fade", 4)} x={180} y={176} fill={C.mintSoft} fontSize={10.5} fontFamily={MONO} textAnchor="middle">RUNS BY ITSELF · 24/7</text>
    </g>
  );
}

function CartRemind({ scene }: SceneProps) {
  const paid = /paid/i.test(scene.label ?? "");
  return (
    <g>
      <g {...a("pop", 0.2)}>
        <path d="M60 70 H82 L96 140 H160 L172 90 H88" fill="none" stroke={C.cream} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={104} cy={156} r={7} fill={C.cream} />
        <circle cx={152} cy={156} r={7} fill={C.cream} />
        <rect {...a("pop", 0.6)} x={104} y={96} width={22} height={28} rx={4} fill={C.amber} />
        <rect {...a("pop", 0.8)} x={132} y={100} width={22} height={24} rx={4} fill={C.coral} />
      </g>
      {scene.label && <Chip x={116} y={190} text={scene.label} fill={paid ? C.mint : C.panel} color={paid ? C.navy : C.cream} delay={1} />}
      <g {...a("fade", 1.4)}>
        <circle cx={226} cy={64} r={22} fill="none" stroke={C.line} strokeWidth={3} />
        <path d="M226 50 V64 L236 70" fill="none" stroke={C.cream} strokeWidth={3} strokeLinecap="round" />
      </g>
      <g {...a("pop", 2.6)}>
        <rect x={196} y={104} width={142} height={44} rx={14} fill={C.cream} />
        <path d="M212 118 a8 8 0 0 1 16 0 v8 l3 4 h-22 l3 -4 Z" fill={C.amber} />
        <text x={238} y={124} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT}>Still want it?</text>
        <text x={238} y={138} fill={C.teal} fontSize={9.5} fontWeight={700} fontFamily={FONT}>Tap to finish</text>
      </g>
      <g {...a("pop", 4)}>
        <circle cx={300} cy={178} r={16} fill={C.mint} />
        <path d="M292 178 l6 6 l10 -11" fill="none" stroke={C.navy} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <circle className="fi-ring" cx={300} cy={178} r={16} fill="none" stroke={C.mint} strokeWidth={2} />
      </g>
    </g>
  );
}

function AdFunnel({ scene, paused, still }: SceneProps) {
  const tiers = scene.chips?.length ? scene.chips.slice(0, 3) : ["Saw it", "Tapped", "Bought"];
  const numbers = ["1,000", "30", "6"];
  return (
    <g>
      {tiers.map((tier, i) => {
        const width = 200 - i * 56;
        return (
          <g key={tier} {...a("growx", 0.3 + i * 0.6, { transformOrigin: "center" })}>
            <rect x={130 - width / 2} y={40 + i * 54} width={width} height={42} rx={12} fill={[C.teal, C.mint, C.amber][i]} />
            <text x={130} y={58 + i * 54} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{tier}</text>
            <text x={130} y={73 + i * 54} fill={C.navy} fontSize={11} fontWeight={800} fontFamily={MONO} textAnchor="middle">{numbers[i]}</text>
          </g>
        );
      })}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${110 + i * 10} 20)`}>
          <circle className="fi-loop" style={{ ...v(0, 150 - (i % 3) * 40), animationDelay: `${1.6 + i * 0.4}s` }} r={4} fill={C.cream} />
        </g>
      ))}
      {scene.value && (
        <g {...a("pop", 2.4)}>
          <rect x={250} y={74} width={88} height={72} rx={18} fill={C.cream} />
          <Counter value={scene.value} x={294} y={120} size={26} delayMs={2600} paused={paused} still={still} anchor="middle" color={C.navy} />
        </g>
      )}
    </g>
  );
}

function LinkShare({ scene }: SceneProps) {
  const friends = [{ x: 60, y: 46 }, { x: 300, y: 46 }, { x: 60, y: 176 }, { x: 300, y: 176 }];
  return (
    <g>
      {friends.map((friend, i) => (
        <g key={i}>
          <line {...a("draw", 0.8 + i * 0.2)} pathLength={1} x1={180} y1={110} x2={friend.x} y2={friend.y} stroke={C.line} strokeWidth={2} strokeDasharray="1" />
          <g {...a("pop", 1 + i * 0.2)}>
            <circle cx={friend.x} cy={friend.y} r={20} fill={DOT_COLORS[i]} />
            <circle cx={friend.x} cy={friend.y - 5} r={6} fill={C.navy} />
            <path d={`M${friend.x - 10} ${friend.y + 12} a10 9 0 0 1 20 0`} fill={C.navy} />
          </g>
          <g transform={`translate(${friend.x} ${friend.y})`}>
            <circle className="fi-loop" style={{ ...v(180 - friend.x, 110 - friend.y), animationDelay: `${2.2 + i * 0.5}s`, animationDuration: "2.6s" }} r={6} fill={C.amber} stroke={C.navy} strokeWidth={1.5} />
          </g>
        </g>
      ))}
      <g {...a("pop", 0.2)}>
        <rect x={100} y={92} width={160} height={36} rx={18} fill={C.cream} />
        <path d="M118 110 a6 6 0 0 1 6 -6 h6 M136 110 a6 6 0 0 1 -6 6 h-6" fill="none" stroke={C.teal} strokeWidth={2.5} strokeLinecap="round" />
        <text x={146} y={114} fill={C.navy} fontSize={10} fontWeight={700} fontFamily={MONO}>{(scene.label ?? "shop.ng/?ref=you").slice(0, 18)}</text>
      </g>
    </g>
  );
}

function QuoteTags({ scene }: SceneProps) {
  const prices = scene.chips?.length ? scene.chips.slice(0, 3) : ["₦1,100", "₦950", "₦900"];
  return (
    <g>
      <g {...a("pop", 0.1)}>
        <circle cx={56} cy={100} r={30} fill={C.panel} stroke={C.line} strokeWidth={2} />
        <path d="M40 92 h32 l-3 20 h-26 Z" fill={C.mint} />
        <text x={56} y={152} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">SHOP</text>
      </g>
      <g {...a("pop", 0.3)}>
        <circle cx={304} cy={100} r={30} fill={C.panel} stroke={C.line} strokeWidth={2} />
        <rect x={290} y={88} width={28} height={24} rx={3} fill={C.amber} />
        <text x={304} y={152} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">SUPPLIER</text>
      </g>
      {prices.map((price, i) => {
        const fromRight = i % 2 === 0;
        const last = i === prices.length - 1;
        return (
          <g key={price} transform={`translate(${fromRight ? 270 : 90} ${54 + i * 42})`}>
            <g {...a("fly", 0.9 + i * 1.1, v(fromRight ? -180 + 90 : 180 - 90, 0))}>
              <path d="M-38 -14 H28 L40 0 L28 14 H-38 Z" fill={last ? C.mint : C.cream} />
              <circle cx={28} cy={0} r={3} fill={C.navy} />
              <text x={-6} y={4} fill={C.navy} fontSize={11.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{price}</text>
            </g>
          </g>
        );
      })}
      <Chip x={180} y={200} text="Deal ✓" fill={C.mint} color={C.navy} delay={0.9 + prices.length * 1.1} kind="pop" />
    </g>
  );
}

function CashCollect({ scene, paused, still }: SceneProps) {
  return (
    <g>
      <g {...a("pop", 0.1)}>
        <path d="M24 96 L64 66 L104 96 V170 H24 Z" fill={C.cream} />
        <rect x={52} y={124} width={24} height={46} rx={3} fill={C.teal} />
        <circle cx={120} cy={120} r={12} fill={C.amber} />
        <rect x={110} y={134} width={20} height={34} rx={8} fill={C.amber} />
      </g>
      <g {...a("pop", 0.5)}>
        <circle cx={196} cy={116} r={12} fill={C.mint} />
        <rect x={186} y={130} width={20} height={36} rx={8} fill={C.mint} />
        <rect x={208} y={128} width={20} height={16} rx={3} fill={C.coral} />
      </g>
      {[0, 1, 2].map((i) => (
        <g key={i} transform="translate(130 136)">
          <rect className="fi-loop" style={{ ...v(56, -6), animationDelay: `${1 + i * 0.7}s` }} x={-12} y={-7} width={24} height={14} rx={2} fill={C.whatsapp} stroke={C.navy} strokeWidth={1.5} />
        </g>
      ))}
      <line {...a("draw", 2)} pathLength={1} x1={236} y1={140} x2={276} y2={140} stroke={C.mint} strokeWidth={3} strokeDasharray="1" strokeLinecap="round" />
      <g {...a("pop", 2.6)}>
        <path d="M300 92 L330 104 V128 C330 148 316 160 300 166 C284 160 270 148 270 128 V104 Z" fill={C.panel} stroke={C.mint} strokeWidth={2.5} />
        <rect x={290} y={122} width={20} height={16} rx={3} fill={C.mint} />
        <path d="M294 122 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke={C.mint} strokeWidth={2.5} />
      </g>
      {scene.value && (
        <g {...a("rise", 1.4)}>
          <Counter value={scene.value} x={160} y={52} size={22} delayMs={1600} paused={paused} still={still} anchor="middle" />
          <text x={160} y={70} fill={C.mintSoft} fontSize={9.5} fontFamily={MONO} textAnchor="middle">CASH AT THE DOOR</text>
        </g>
      )}
      {scene.label && <Chip x={300} y={196} text={scene.label} fill={C.cream} color={C.navy} delay={3} />}
    </g>
  );
}

const THEMES = [
  { bg: C.cream, top: C.teal, card: C.amber, ink: C.navy },
  { bg: "#1B1B22", top: C.coral, card: C.plum, ink: C.cream },
  { bg: C.mintSoft, top: C.navy, card: C.coral, ink: C.navy },
];

function ThemeSwap({ scene }: SceneProps) {
  const chips = scene.chips?.length ? scene.chips.slice(0, 3) : ["Market", "Boutique", "Bold"];
  return (
    <g>
      {THEMES.slice(0, Math.max(2, chips.length)).map((theme, i) => (
        <g key={i} className={i === 0 ? undefined : "fi-cycle"} style={i === 0 ? undefined : { animationDelay: `${i * 2.5}s`, opacity: 0 }}>
          <rect x={70} y={16} width={220} height={150} rx={16} fill={theme.bg} />
          <rect x={70} y={16} width={220} height={36} rx={16} fill={theme.top} />
          <rect x={70} y={36} width={220} height={16} fill={theme.top} />
          <rect x={86} y={64} width={110} height={10} rx={5} fill={theme.ink} opacity={0.85} />
          <rect x={86} y={80} width={70} height={7} rx={3.5} fill={theme.ink} opacity={0.4} />
          {[0, 1, 2].map((k) => <rect key={k} x={86 + k * 66} y={98} width={58} height={54} rx={10} fill={theme.card} opacity={0.9 - k * 0.15} />)}
        </g>
      ))}
      {chips.map((chip, i) => (
        <Chip key={chip} x={110 + i * (chips.length === 2 ? 140 : 70)} y={194} text={chip} fill={[C.teal, C.coral, C.mint][i]} color={i === 0 ? C.cream : C.navy} delay={0.4 + i * 0.2} />
      ))}
    </g>
  );
}

/** Scene art id → illustration. tests/learn.test.mjs checks every SCENE_ARTS id has an entry here. */
export const SCENE_KIT: Record<SceneArt, (props: SceneProps) => ReactNode> = {
  "phone-store": PhoneStore,
  "dots-sort": DotsSort,
  "chat-bubbles": ChatBubbles,
  "send-burst": SendBurst,
  "chart-grow": ChartGrow,
  "money-flow": MoneyFlow,
  "store-card": StoreCard,
  "product-stock": ProductStock,
  "bike-route": BikeRoute,
  "domain-type": DomainType,
  "supplier-ship": SupplierShip,
  "flow-nodes": FlowNodes,
  "cart-remind": CartRemind,
  "ad-funnel": AdFunnel,
  "link-share": LinkShare,
  "quote-tags": QuoteTags,
  "cash-collect": CashCollect,
  "theme-swap": ThemeSwap,
};

/** One scene's illustration, restarted whenever `restartKey` changes. */
export function SceneArtwork({ scene, paused, still, restartKey }: SceneProps & { restartKey: string }) {
  const Art = SCENE_KIT[scene.art];
  return (
    <svg key={restartKey} viewBox="0 0 360 220" role="img" aria-label={scene.caption} className="block h-full w-full" preserveAspectRatio="xMidYMid meet">
      <Art scene={scene} paused={paused} still={still} />
    </svg>
  );
}
