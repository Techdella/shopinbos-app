"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { IntroScene, SceneArt } from "@shared/feature-intros";
import { useT } from "@/components/i18n/I18nProvider";

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
.fi-stage .fi-float, .fi-stage .fi-pulse, .fi-stage .fi-ring { transform-box: fill-box; transform-origin: center; }
.fi-stage .fi-swing { transform-box: fill-box; transform-origin: 50% 0; animation: fi-swing 2.6s ease-in-out infinite; }
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
@keyframes fi-ring { from { transform: scale(.8); opacity: .7; } to { transform: scale(1.6); opacity: 0; } }
@keyframes fi-loop { 0% { transform: translate(0, 0); opacity: 0; } 12% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)); opacity: 0; } }
@keyframes fi-ride { 0% { offset-distance: 0%; } 80%, 100% { offset-distance: 100%; } }
@keyframes fi-blink { 50% { opacity: 0; } }
@keyframes fi-swing { 0%, 55%, 100% { transform: rotate(0); } 8% { transform: rotate(14deg); } 18% { transform: rotate(-11deg); } 28% { transform: rotate(7deg); } 38% { transform: rotate(-4deg); } }
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
  const t = useT("ui");
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
          <text x={246} y={166} fill={C.teal} fontSize={9} fontWeight={700} fontFamily={MONO}>{t("scene.paid")}</text>
          <Counter value={scene.value} x={246} y={184} size={15} delayMs={2900} paused={paused} still={still} color={C.navy} />
        </g>
      )}
      {chips.map((chip, i) => (
        <g key={chip} className="fi-float" style={{ animationDelay: `${i * 0.5}s` }}>
          <Chip x={i % 2 ? 290 : 70} y={50 + i * 46} text={chip} fill={/whatsapp/i.test(chip) ? C.whatsapp : [C.coral, C.plum, C.amber][i % 3]} color={C.navy} delay={1.2 + i * 0.4} kind="pop" />
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
              <rect x={-34} y={-14} width={68} height={28} rx={14} fill={target.color} />
              <text y={4} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{target.label}</text>
            </g>
          </g>
        ))}
      </g>
      {[[28, 96], [52, 132], [332, 96], [308, 132], [128, 196], [232, 196]].map(([x, y], i) => (
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
  const t = useT("ui");
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
      <text {...a("fade", 1)} x={70} y={83} fill={C.cream} fontSize={12} fontWeight={800} fontFamily={FONT}>{t("scene.newIn")}</text>
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
  const t = useT("ui");
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
        <text x={276} y={74} fill={C.mintSoft} fontSize={9.5} fontFamily={MONO} textAnchor="middle">{t("scene.inStock")}</text>
        <Counter value={String(target)} from={target + 9} x={276} y={114} size={34} delayMs={1800} paused={paused} still={still} anchor="middle" color={target <= 3 ? C.amber : C.cream} />
      </g>
      {target <= 5 ? <Chip x={276} y={156} text={t("scene.lowStock")} fill={C.amber} color={C.navy} delay={3} kind="pop" /> : <Chip x={276} y={156} text={t("scene.updated")} fill={C.mint} color={C.navy} delay={3} kind="pop" />}
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
  const t = useT("ui");
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
      <Chip x={268} y={102} text={t("scene.secure")} fill={C.mint} color={C.navy} delay={typingDone / 1000 + 0.8} kind="pop" />
    </g>
  );
}

function SupplierShip({ scene }: SceneProps) {
  const t = useT("ui");
  return (
    <g>
      <g {...a("pop", 0.2)}>
        <path d="M30 100 L80 70 L130 100 V170 H30 Z" fill={C.panel} stroke={C.line} strokeWidth={2} />
        <rect x={60} y={124} width={40} height={46} rx={4} fill={C.deep} />
        {[0, 1, 2].map((i) => <line key={i} x1={62} y1={132 + i * 12} x2={98} y2={132 + i * 12} stroke={C.line} strokeWidth={2} />)}
        <text x={80} y={192} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">{t("scene.supplier")}</text>
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
        <text x={290} y={192} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">{t("scene.customer")}</text>
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
  const t = useT("ui");
  const steps = (scene.chips?.length ? scene.chips : ["When", "Wait", "Send"]).slice(0, 3);
  const x = (i: number) => 28 + i * 112;
  return (
    <g>
      {steps.slice(1).map((_, i) => (
        <line key={i} {...a("draw", 0.8 + i * 1.3)} pathLength={1} x1={x(i) + 96} y1={110} x2={x(i + 1)} y2={110} stroke={C.mint} strokeWidth={3} strokeDasharray="1" />
      ))}
      {steps.map((step, i) => (
        <g key={step}>
          <g {...a("rise", 0.1 + i * 0.15)}>
            <rect className="fi fi-lit" style={{ animationDelay: `${0.5 + i * 1.3}s` }} x={x(i)} y={84} width={96} height={52} rx={14} fill={i === steps.length - 1 ? C.mint : C.teal} stroke={C.mint} strokeWidth={2} />
          </g>
          <text {...a("fade", 0.5 + i * 1.3)} x={x(i) + 48} y={115} fill={i === steps.length - 1 ? C.navy : C.cream} fontSize={11} fontWeight={800} fontFamily={FONT} textAnchor="middle">{step}</text>
          <g {...a("pop", 0.7 + i * 1.3)}>
            <circle cx={x(i) + 48} cy={64} r={11} fill={C.amber} />
            <text x={x(i) + 48} y={68} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{i + 1}</text>
          </g>
        </g>
      ))}
      <circle className="fi-ring" style={{ animationDelay: "3.6s" }} cx={x(steps.length - 1) + 48} cy={110} r={30} fill="none" stroke={C.mint} strokeWidth={2} />
      <text {...a("fade", 4)} x={180} y={176} fill={C.mintSoft} fontSize={10.5} fontFamily={MONO} textAnchor="middle">{t("scene.runsItself")}</text>
    </g>
  );
}

function CartRemind({ scene }: SceneProps) {
  const t = useT("ui");
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
        <text x={238} y={124} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT}>{t("scene.stillWant")}</text>
        <text x={238} y={138} fill={C.teal} fontSize={9.5} fontWeight={700} fontFamily={FONT}>{t("scene.tapToFinish")}</text>
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
      <rect className="fi-ring" style={{ animationDelay: "2s" }} x={84} y={146} width={92} height={46} rx={14} fill="none" stroke={C.amber} strokeWidth={2} />
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
  const t = useT("ui");
  const prices = scene.chips?.length ? scene.chips.slice(0, 3) : ["₦1,100", "₦950", "₦900"];
  return (
    <g>
      <g {...a("pop", 0.1)}>
        <circle cx={56} cy={100} r={30} fill={C.panel} stroke={C.line} strokeWidth={2} />
        <path d="M40 92 h32 l-3 20 h-26 Z" fill={C.mint} />
        <text x={56} y={152} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">{t("scene.shop")}</text>
      </g>
      <g {...a("pop", 0.3)}>
        <circle cx={304} cy={100} r={30} fill={C.panel} stroke={C.line} strokeWidth={2} />
        <rect x={290} y={88} width={28} height={24} rx={3} fill={C.amber} />
        <text x={304} y={152} fill={C.mintSoft} fontSize={10} fontFamily={MONO} textAnchor="middle">{t("scene.supplier")}</text>
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
      <Chip x={180} y={200} text={t("scene.deal")} fill={C.mint} color={C.navy} delay={0.9 + prices.length * 1.1} kind="pop" />
    </g>
  );
}

function CashCollect({ scene, paused, still }: SceneProps) {
  const t = useT("ui");
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
          <text x={160} y={70} fill={C.mintSoft} fontSize={9.5} fontFamily={MONO} textAnchor="middle">{t("scene.cashAtDoor")}</text>
        </g>
      )}
      {scene.label && <Chip x={252} y={196} text={scene.label} fill={C.cream} color={C.navy} delay={3} />}
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

// ─── Scenes for orders, money, customers, brand and partners ───

/** Wraps an element whose own transform is animated, so a positioning transform isn't overwritten. */
function At({ x = 0, y = 0, rotate, children }: { x?: number; y?: number; rotate?: number; children: ReactNode }) {
  return <g transform={`translate(${x} ${y})${rotate ? ` rotate(${rotate})` : ""}`}>{children}</g>;
}

/** Slides in from (dx, dy) while fading in. */
function slide(delay: number, dx: number, dy: number, extra?: CSSProperties) {
  return a("move", delay, { ...v(dx, dy), animationName: "fi-move, fi-fade", ...extra });
}

function starPath(cx: number, cy: number, r: number) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)} ${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  });
  return `M${points.join(" L")} Z`;
}

function Check({ x, y, size = 1, color = C.navy }: { x: number; y: number; size?: number; color?: string }) {
  return <path d={`M${x - 6 * size} ${y} l${4 * size} ${4 * size} l${8 * size} ${-9 * size}`} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />;
}

/** Chip width, the same sum <Chip> uses. */
const chipWidth = (text: string, size = 11) => Math.max(34, text.length * size * 0.58 + 20);

/** Channel or tag colour for a chip: WhatsApp green, Instagram plum, and so on. */
function chipColor(text: string, i: number) {
  if (/whatsapp/i.test(text)) return C.whatsapp;
  if (/insta|reels/i.test(text)) return C.plum;
  if (/live/i.test(text)) return C.mint;
  if (/form/i.test(text)) return C.amber;
  if (/tiktok/i.test(text)) return C.coral;
  return [C.mint, C.amber, C.coral, C.plum, C.mintSoft][i % 5]!;
}

const STATUSES = ["New", "Paid", "Packed", "On the way", "Delivered"];

function OrderPipeline({ scene }: SceneProps) {
  const steps = (scene.chips?.length ? scene.chips : STATUSES).slice(0, 5);
  const n = steps.length;
  const x = (i: number) => (n === 1 ? 180 : 44 + (272 / (n - 1)) * i);
  const y = 122;
  const gap = 0.75;
  const run = Math.max(0.1, (n - 1) * gap);
  return (
    <g>
      <line x1={x(0)} y1={y} x2={x(n - 1)} y2={y} stroke={C.panel} strokeWidth={8} strokeLinecap="round" />
      <line {...a("draw", 0.6, { animationDuration: `${run}s`, animationTimingFunction: "linear" })} pathLength={1} x1={x(0)} y1={y} x2={x(n - 1)} y2={y} stroke={C.mint} strokeWidth={4} strokeDasharray="1" strokeLinecap="round" />
      {steps.map((step, i) => {
        const delay = 0.6 + i * gap;
        const last = i === n - 1;
        return (
          <g key={`${step}-${i}`}>
            <circle cx={x(i)} cy={y} r={15} fill={C.panel} stroke={C.line} strokeWidth={2} />
            <circle {...a("pop", delay)} cx={x(i)} cy={y} r={15} fill={last ? C.mint : C.teal} stroke={C.mint} strokeWidth={2} />
            <g {...a("fade", delay + 0.2)}>
              <Check x={x(i)} y={y} color={last ? C.navy : C.cream} />
            </g>
            <text x={x(i)} y={y + 36} fill={C.mintSoft} opacity={0.45} fontSize={10.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{step}</text>
            <text {...a("fade", delay)} x={x(i)} y={y + 36} fill={last ? C.mint : C.cream} fontSize={10.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{step}</text>
          </g>
        );
      })}
      <circle className="fi-ring" style={{ animationDelay: `${0.6 + run}s` }} cx={x(n - 1)} cy={y} r={18} fill="none" stroke={C.mint} strokeWidth={2} />
      <At x={x(n - 1)} y={y - 44}>
        <g {...a("move", 0.6, { ...v(x(0) - x(n - 1), 0), animationDuration: `${run}s`, animationTimingFunction: "linear" })}>
          <rect x={-14} y={-12} width={28} height={24} rx={4} fill={C.amber} />
          <path d="M-14 -4 H14 M0 -12 V-4" stroke={C.navy} strokeWidth={2} />
          <path d="M-5 16 L0 22 L5 16 Z" fill={C.amber} />
        </g>
      </At>
      {scene.label && <Chip x={180} y={28} text={scene.label} fill={C.cream} color={C.navy} delay={0.2} kind="pop" />}
    </g>
  );
}

function Receipt({ scene, paused, still }: SceneProps) {
  const t = useT("ui");
  const lines = (scene.chips ?? []).slice(0, 3);
  const left = 112;
  const w = 136;
  const top = 18;
  const bottom = 206;
  const teeth = 10;
  const zig = Array.from({ length: teeth + 1 }, (_, i) => `L${(left + w - (i * w) / teeth).toFixed(1)} ${i % 2 ? bottom - 6 : bottom}`).join(" ");
  const rows = Math.max(2, lines.length);
  const rule = top + 66 + rows * 18;
  return (
    <g>
      <rect x={left - 12} y={top - 8} width={w + 24} height={10} rx={5} fill={C.line} />
      <g {...a("rise", 0.1)}>
        <path d={`M${left} ${top} H${left + w} V${bottom} ${zig} Z`} fill={C.cream} />
        <circle cx={left + w / 2} cy={top + 22} r={10} fill={C.teal} />
        <text x={left + w / 2} y={top + 48} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT} textAnchor="middle">{(scene.label ?? "Receipt").slice(0, 20)}</text>
        <line x1={left + 10} y1={top + 58} x2={left + w - 10} y2={top + 58} stroke={C.navy} strokeOpacity={0.3} strokeDasharray="3 4" />
      </g>
      {Array.from({ length: rows }, (_, i) => (
        <g key={i} {...a("rise", 0.7 + i * 0.4)}>
          {lines[i] ? (
            <text x={left + 12} y={top + 78 + i * 18} fill={C.navy} fontSize={9.5} fontWeight={600} fontFamily={MONO}>{lines[i]!.slice(0, 21)}</text>
          ) : (
            <>
              <rect x={left + 12} y={top + 72 + i * 18} width={70} height={5} rx={2.5} fill="#C9C6D3" />
              <rect x={left + w - 44} y={top + 72 + i * 18} width={32} height={5} rx={2.5} fill="#C9C6D3" />
            </>
          )}
        </g>
      ))}
      <line {...a("fade", 0.8 + rows * 0.4)} x1={left + 10} y1={rule} x2={left + w - 10} y2={rule} stroke={C.navy} strokeOpacity={0.3} strokeDasharray="3 4" />
      {scene.value && (
        <g {...a("rise", 1 + rows * 0.4)}>
          <rect x={left + 12} y={rule + 12} width={26} height={6} rx={3} fill={C.navy} opacity={0.5} />
          <Counter value={scene.value} x={left + w - 12} y={rule + 22} size={16} delayMs={1200 + rows * 400} paused={paused} still={still} anchor="end" color={C.navy} />
        </g>
      )}
      <At x={left + w / 2 + 4} y={bottom - 18} rotate={-10}>
        <g {...a("pop", 2.4 + rows * 0.2)}>
          <rect x={-40} y={-14} width={80} height={28} rx={6} fill="rgba(46,126,120,0.08)" stroke={C.teal} strokeWidth={2.5} />
          <text y={5} fill={C.teal} fontSize={13} fontWeight={800} fontFamily={MONO} textAnchor="middle" letterSpacing={2}>{t("scene.paid")}</text>
        </g>
      </At>
      <g className="fi-float">
        <rect {...a("pop", 1)} x={34} y={70} width={48} height={28} rx={4} fill={C.whatsapp} />
        <circle {...a("pop", 1.1)} cx={58} cy={84} r={7} fill={C.deep} opacity={0.35} />
      </g>
      <g className="fi-float" style={{ animationDelay: "0.8s" }}>
        <rect {...a("pop", 1.3)} x={34} y={122} width={48} height={32} rx={6} fill={C.plum} />
        <rect {...a("pop", 1.4)} x={34} y={130} width={48} height={6} fill={C.navy} opacity={0.5} />
      </g>
      <g {...a("pop", 2)}>
        <circle cx={300} cy={72} r={16} fill={C.mint} />
        <Check x={301} y={72} />
      </g>
      <circle className="fi-ring" style={{ animationDelay: "2.2s" }} cx={300} cy={72} r={16} fill="none" stroke={C.mint} strokeWidth={2} />
      {[0, 1, 2].map((i) => <circle key={i} {...a("pop", 2.4 + i * 0.15)} cx={292 + i * 10} cy={150 - i * 8} r={9} fill={C.amber} stroke={C.navy} strokeWidth={2} />)}
    </g>
  );
}

function InvoicePaper({ scene, paused, still }: SceneProps) {
  const chips = scene.chips ?? [];
  const stamp = chips.find((chip) => /✓|paid/i.test(chip));
  const pills = chips.filter((chip) => chip !== stamp).slice(0, 2);
  const left = 92;
  const top = 12;
  const w = 168;
  const h = 196;
  const rows = scene.value ? 4 : 6;
  return (
    <g>
      <g {...a("rise", 0.1)}>
        <rect x={left + 6} y={top + 6} width={w} height={h} rx={10} fill={C.panel} />
        <rect x={left} y={top} width={w} height={h} rx={10} fill={C.cream} />
        <rect x={left} y={top} width={w} height={6} rx={3} fill={C.teal} />
        <circle cx={left + 24} cy={top + 30} r={10} fill={C.teal} />
        <text x={left + 40} y={top + 34} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={MONO}>{(scene.label ?? "INVOICE").slice(0, 16)}</text>
        <rect x={left + 16} y={top + 50} width={w - 32} height={2} fill="#E8E2D5" />
      </g>
      {Array.from({ length: rows }, (_, i) => (
        <g key={i}>
          <rect {...a("growx", 0.5 + i * 0.2)} x={left + 16} y={top + 64 + i * 16} width={[86, 64, 78, 52, 90, 70][i]} height={6} rx={3} fill="#D9D3C4" />
          {scene.value && <rect {...a("fade", 0.7 + i * 0.2)} x={left + w - 52} y={top + 64 + i * 16} width={36} height={6} rx={3} fill="#C9C6D3" />}
        </g>
      ))}
      {scene.value && (
        <g {...a("rise", 1.6)}>
          <rect x={left + 16} y={top + 140} width={w - 32} height={2} fill={C.navy} opacity={0.2} />
          <rect x={left + 16} y={top + 160} width={30} height={7} rx={3.5} fill={C.teal} />
          <Counter value={scene.value} x={left + w - 16} y={top + 170} size={17} delayMs={1800} paused={paused} still={still} anchor="end" color={C.navy} />
        </g>
      )}
      {pills.map((pill, i) => (
        <Chip key={pill} x={Math.max(left + w + 8 + chipWidth(pill) / 2, 312)} y={64 + i * 32} text={pill} fill={C.amber} color={C.navy} delay={1.4 + i * 0.3} kind="pop" />
      ))}
      {stamp && (
        <At x={left + w / 2} y={top + 108} rotate={-12}>
          <g {...a("pop", 2.6)}>
            <rect x={-54} y={-18} width={108} height={36} rx={8} fill="rgba(46,126,120,0.1)" stroke={C.teal} strokeWidth={3} />
            <text y={6} fill={C.teal} fontSize={15} fontWeight={800} fontFamily={MONO} textAnchor="middle" letterSpacing={1.5}>{stamp.toUpperCase().slice(0, 10)}</text>
          </g>
        </At>
      )}
      <g className="fi-float">
        <path {...a("pop", 1)} d="M34 112 L74 94 L62 132 L54 118 Z" fill={C.mint} />
        <path {...a("fade", 1.2)} d="M54 118 L74 94" stroke={C.navy} strokeWidth={1.5} />
      </g>
    </g>
  );
}

function StarReviews({ scene }: SceneProps) {
  const value = scene.value ?? "4.8";
  const rating = Math.min(5, Math.max(0, Number.parseFloat(value) || 5));
  const full = Math.round(rating);
  return (
    <g>
      <g {...a("pop", 0.1)}>
        <rect x={20} y={38} width={124} height={144} rx={20} fill={C.panel} stroke={C.line} strokeWidth={2} />
        <text x={82} y={102} fill={C.cream} fontSize={40} fontWeight={800} fontFamily={FONT} textAnchor="middle">{value}</text>
      </g>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <path d={starPath(42 + i * 20, 128, 8.5)} fill={C.line} />
          {i < full && <path {...a("pop", 0.6 + i * 0.18)} d={starPath(42 + i * 20, 128, 8.5)} fill={C.amber} />}
        </g>
      ))}
      <rect {...a("growx", 1.6)} x={42} y={152} width={80} height={6} rx={3} fill={C.line} />
      {[0, 1, 2].map((i) => {
        const top = 22 + i * 62;
        return (
          <g key={i} {...slide(1 + i * 0.55, 60, 0)}>
            <rect x={160} y={top} width={184} height={52} rx={14} fill={i === 0 ? C.cream : C.panel} />
            <circle cx={180} cy={top + 18} r={9} fill={[C.mint, C.amber, C.plum][i]} />
            {[0, 1, 2, 3, 4].map((k) => <path key={k} d={starPath(198 + k * 12, top + 18, 5)} fill={i === 2 && k === 4 ? C.line : C.amber} />)}
            {i === 0 && scene.label ? (
              <text x={174} y={top + 40} fill={C.navy} fontSize={10.5} fontWeight={800} fontFamily={FONT}>“{scene.label.slice(0, 24)}”</text>
            ) : (
              <rect x={174} y={top + 34} width={[120, 96, 110][i]} height={5} rx={2.5} fill={i === 0 ? "#C9C6D3" : C.line} />
            )}
          </g>
        );
      })}
    </g>
  );
}

function CustomerCards({ scene, paused, still }: SceneProps) {
  const name = scene.label ?? "Customer";
  const initials = name.split(/\s+/).map((word) => word[0] ?? "").join("").slice(0, 2).toUpperCase();
  const chips = (scene.chips ?? []).slice(0, 3);
  let cursor = 88;
  const tags = chips.map((chip) => {
    const x = cursor;
    cursor += chipWidth(chip, 10) + 6;
    return { chip, x };
  });
  return (
    <g>
      <rect {...a("fade", 0.1)} x={96} y={20} width={190} height={150} rx={18} fill={C.line} />
      <rect {...a("fade", 0.2)} x={84} y={32} width={190} height={150} rx={18} fill={C.panel} />
      <g {...a("rise", 0.3)}>
        <rect x={70} y={46} width={196} height={158} rx={18} fill={C.cream} />
        <circle cx={104} cy={82} r={20} fill={C.mint} />
        <text x={104} y={87} fill={C.navy} fontSize={13} fontWeight={800} fontFamily={FONT} textAnchor="middle">{initials}</text>
        <text x={134} y={80} fill={C.navy} fontSize={12.5} fontWeight={800} fontFamily={FONT}>{name.slice(0, 17)}</text>
        <rect x={134} y={88} width={70} height={5} rx={2.5} fill="#C9C6D3" />
      </g>
      {tags.map(({ chip, x }, i) => (
        <Chip key={chip} x={x} y={124} text={chip} anchor="start" size={10} fill={[C.amber, C.mintSoft, C.plum][i]} color={C.navy} delay={0.9 + i * 0.25} kind="pop" />
      ))}
      <line {...a("growx", 1.6)} x1={92} y1={172} x2={248} y2={172} stroke="#E8E2D5" strokeWidth={3} strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} {...a("pop", 1.8 + i * 0.25)}>
          <circle cx={100 + i * 46} cy={172} r={8} fill={i === 3 ? C.mint : C.teal} />
          <rect x={96 + i * 46} y={168} width={8} height={7} rx={1.5} fill={C.cream} opacity={0.9} />
        </g>
      ))}
      <circle className="fi-ring" style={{ animationDelay: "2.8s" }} cx={238} cy={172} r={8} fill="none" stroke={C.mint} strokeWidth={2} />
      {scene.value && (
        <g {...a("pop", 2.4)}>
          <rect x={276} y={56} width={78} height={50} rx={16} fill={C.mint} />
          <path d={starPath(315, 72, 7)} fill={C.navy} />
          <Counter value={scene.value} x={315} y={96} size={13} delayMs={2600} paused={paused} still={still} anchor="middle" color={C.navy} />
        </g>
      )}
    </g>
  );
}

function DiscountTicket({ scene, paused, still }: SceneProps) {
  const code = scene.label ?? "SALE10";
  const value = scene.value ?? "10%";
  return (
    <g>
      <g transform="rotate(-5 180 110)">
        <g {...a("pop", 0.1)}>
          <rect x={48} y={58} width={264} height={104} rx={14} fill={C.amber} />
          <circle cx={48} cy={110} r={13} fill={C.deep} />
          <circle cx={312} cy={110} r={13} fill={C.deep} />
          <line x1={134} y1={66} x2={134} y2={154} stroke={C.navy} strokeOpacity={0.4} strokeWidth={2} strokeDasharray="4 5" />
          <Counter value={value} x={92} y={120} size={value.length > 4 ? 17 : 26} delayMs={700} paused={paused} still={still} anchor="middle" color={C.navy} />
        </g>
        <Typed text={code.slice(0, 14)} x={150} y={116} delayMs={900} paused={paused} still={still} size={code.length > 10 ? 13 : 16} color={C.navy} cursor={C.teal} />
        <rect {...a("growx", 1 + code.length * 0.085)} x={150} y={128} width={140} height={4} rx={2} fill={C.navy} opacity={0.25} />
      </g>
      <g className="fi-pulse" style={{ animationDelay: "2s" }}>
        <circle {...a("pop", 1.6)} cx={300} cy={44} r={20} fill={C.coral} />
        <text {...a("fade", 1.7)} x={300} y={51} fill={C.cream} fontSize={20} fontWeight={800} fontFamily={FONT} textAnchor="middle">%</text>
      </g>
      {[[70, 36, C.mint], [40, 186, C.plum], [250, 192, C.mint], [330, 172, C.amber]].map(([x, y, color], i) => (
        <circle key={i} {...a("pop", 2 + i * 0.2)} cx={x as number} cy={y as number} r={5} fill={color as string} />
      ))}
    </g>
  );
}

function swatchColor(name: string, i: number) {
  if (/mint|green/i.test(name)) return C.mint;
  if (/gold|amber|yellow/i.test(name)) return C.amber;
  if (/coral|red|orange/i.test(name)) return C.coral;
  if (/plum|purple/i.test(name)) return C.plum;
  if (/navy|blue|dark/i.test(name)) return C.deep;
  return [C.mint, C.amber, C.coral, C.deep][i % 4]!;
}

function BrandPalette({ scene }: SceneProps) {
  const name = scene.label ?? "Your brand";
  const chips = (scene.chips ?? []).slice(0, 4);
  const swatches = chips.length ? chips.map(swatchColor) : [C.mint, C.amber, C.coral, C.deep];
  return (
    <g>
      <g {...a("pop", 0.1)}>
        <circle cx={82} cy={84} r={42} fill={C.mint} />
        <circle cx={82} cy={84} r={33} fill="none" stroke={C.navy} strokeWidth={2.5} />
        <text x={82} y={96} fill={C.navy} fontSize={32} fontWeight={800} fontFamily={FONT} textAnchor="middle">{name.trim()[0]?.toUpperCase() ?? "B"}</text>
      </g>
      <text {...a("fade", 0.5)} x={82} y={150} fill={C.cream} fontSize={12} fontWeight={800} fontFamily={FONT} textAnchor="middle">{name.slice(0, 18)}</text>
      {swatches.map((color, i) => (
        <g key={i} {...a("pop", 0.8 + i * 0.2)}>
          <rect x={164 + i * 44} y={30} width={36} height={36} rx={10} fill={color} stroke={color === C.deep ? C.cream : "none"} strokeOpacity={0.5} strokeWidth={1.5} />
          {chips[i] && <text x={182 + i * 44} y={82} fill={C.mintSoft} fontSize={9} fontFamily={MONO} textAnchor="middle">{chips[i]!.slice(0, 7)}</text>}
        </g>
      ))}
      <text {...a("pop", 1.7)} x={166} y={142} fill={C.cream} fontSize={34} fontWeight={800} fontFamily={FONT}>Aa</text>
      <text {...a("pop", 1.9)} x={214} y={142} fill={C.mint} fontSize={32} fontStyle="italic" fontFamily="var(--font-fraunces), Fraunces, Georgia, serif">Aa</text>
      <g {...a("rise", 2.3)}>
        <rect x={270} y={104} width={44} height={60} rx={6} fill={C.cream} />
        <rect x={270} y={104} width={44} height={16} rx={6} fill={swatches[0]} />
        <circle cx={292} cy={136} r={8} fill={swatches[1] ?? C.amber} />
        <rect x={278} y={150} width={28} height={4} rx={2} fill="#C9C6D3" />
      </g>
      <g {...a("rise", 2.6)}>
        <path d="M322 120 H350 V160 H322 L314 140 Z" fill={swatches[1] ?? C.amber} />
        <circle cx={322} cy={140} r={3} fill={C.deep} />
        <circle cx={337} cy={140} r={7} fill={C.cream} />
      </g>
      <rect {...a("growx", 2.8)} x={166} y={176} width={180} height={6} rx={3} fill={swatches[0]} opacity={0.6} />
    </g>
  );
}

function ImportShip({ scene }: SceneProps) {
  const chips = (scene.chips ?? []).slice(0, 2);
  const containers = [C.amber, C.mint, C.plum, C.coral, C.teal, C.amber, C.mintSoft, C.plum];
  return (
    <g>
      <path {...a("draw", 0.3)} pathLength={1} d="M24 150 H300" stroke={C.mint} strokeWidth={2} strokeDasharray="1" opacity={0.5} />
      {[0, 1, 2].map((row) => (
        <path key={row} className="fi-float" style={{ animationDelay: `${row * 0.6}s` }} d={`M${10 + row * 14} ${170 + row * 12} q 12 -8 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0`} fill="none" stroke={C.line} strokeWidth={2.5} strokeLinecap="round" />
      ))}
      <g {...a("pop", 0.2)}>
        <rect x={292} y={148} width={60} height={12} rx={3} fill={C.panel} />
        <path d="M330 148 V58 M330 64 H296 M300 64 V86" fill="none" stroke={C.cream} strokeWidth={3} strokeLinecap="round" />
        <rect x={293} y={86} width={14} height={10} rx={2} fill={C.amber} />
      </g>
      <g {...a("pop", 0.4)}>
        <path d="M330 32 c-10 -12 -10 -26 0 -26 s10 14 0 26 Z" fill={C.coral} />
        <circle cx={330} cy={14} r={3.5} fill={C.navy} />
      </g>
      <At x={92} y={0}>
        <g {...a("move", 0.5, { ...v(-80, 0), animationDuration: "3.2s", animationTimingFunction: "cubic-bezier(.4,0,.2,1)" })}>
          <g className="fi-float" style={{ animationDuration: "2.4s" }}>
            {containers.map((color, i) => (
              <rect key={i} {...a("pop", 0.2 + i * 0.08)} x={24 + (i % 4) * 22} y={116 - Math.floor(i / 4) * 15} width={20} height={13} rx={2} fill={color} />
            ))}
            <rect x={120} y={98} width={22} height={34} rx={3} fill={C.cream} />
            <rect x={124} y={104} width={14} height={6} rx={2} fill={C.navy} opacity={0.6} />
            <path d="M10 132 H170 L156 160 H26 Z" fill={C.coral} />
            <path d="M18 142 H164" stroke={C.cream} strokeWidth={2} opacity={0.7} />
          </g>
        </g>
      </At>
      <At x={40} y={58}>
        <g className="fi-loop" style={{ ...v(220, -14), animationDuration: "4s", animationDelay: "1s" }}>
          <path d="M0 -3 H30 Q38 0 30 3 H0 Z M12 -3 L6 -14 H11 L20 -3 Z M12 3 L6 14 H11 L20 3 Z M0 -3 L-4 -9 H1 L5 -3 Z" fill={C.mint} />
        </g>
      </At>
      {scene.label && <Chip x={150} y={24} text={scene.label} fill={C.cream} color={C.navy} delay={0.6} />}
      {chips.map((chip, i) => <Chip key={chip} x={i ? 250 : 110} y={202} text={chip} fill={i ? C.amber : C.mint} color={C.navy} delay={1.8 + i * 0.3} kind="pop" />)}
    </g>
  );
}

function VideoReel({ scene }: SceneProps) {
  const frames = [C.amber, C.coral, C.plum];
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i} {...a("pop", 0.2 + i * 0.2)}>
          <rect x={30 + (i % 2) * 18} y={34 + i * 46} width={60} height={42} rx={6} fill={C.cream} />
          <rect x={35 + (i % 2) * 18} y={39 + i * 46} width={50} height={32} rx={4} fill={frames[i]} />
          <path d={`M${44 + (i % 2) * 18} ${64 + i * 46} q 8 -12 18 -6 l 14 6 Z`} fill={C.cream} opacity={0.85} />
        </g>
      ))}
      <path {...a("draw", 0.9)} pathLength={1} d="M104 110 C 116 110, 118 110, 128 110" stroke={C.mint} strokeWidth={3} strokeDasharray="1" strokeLinecap="round" />
      <path {...a("pop", 1.1)} d="M124 104 L132 110 L124 116" fill="none" stroke={C.mint} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <g {...a("rise", 0.1)}>
        <rect x={136} y={12} width={92} height={196} rx={16} fill={C.deep} stroke={C.line} strokeWidth={2} />
        <rect x={168} y={18} width={28} height={4} rx={2} fill={C.line} />
      </g>
      {frames.map((color, i) => (
        <g key={i} className={i === 0 ? undefined : "fi-cycle"} style={i === 0 ? undefined : { animationDelay: `${i * 2.5}s`, opacity: 0 }}>
          <rect x={144} y={28} width={76} height={150} rx={8} fill={color} />
          <path d="M156 128 q 12 -22 30 -12 l 26 12 v 8 h -56 Z" fill={C.cream} opacity={0.9} />
          <circle cx={170} cy={124} r={3} fill={color} />
        </g>
      ))}
      <g className="fi-pulse">
        <circle {...a("pop", 1.4)} cx={182} cy={84} r={16} fill={C.cream} opacity={0.92} />
        <path {...a("fade", 1.5)} d="M177 76 L190 84 L177 92 Z" fill={C.navy} />
      </g>
      <rect x={144} y={182} width={76} height={4} rx={2} fill={C.line} />
      <rect {...a("growx", 1.6, { animationDuration: "3.5s", animationTimingFunction: "linear" })} x={144} y={182} width={76} height={4} rx={2} fill={C.mint} />
      {scene.label && (
        <g {...a("rise", 2)}>
          <rect x={146} y={152} width={72} height={20} rx={6} fill={C.navy} opacity={0.82} />
          <text x={182} y={166} fill={C.cream} fontSize={8} fontWeight={800} fontFamily={FONT} textAnchor="middle">{scene.label.slice(0, 18)}</text>
        </g>
      )}
      {scene.value && <Chip x={268} y={34} text={scene.value} fill={C.mint} color={C.navy} delay={1.2} kind="pop" />}
      {[[262, 84, 0], [296, 120, 0.7], [262, 160, 1.4]].map(([x, y, delay], i) => (
        <g key={i} className="fi-float" style={{ animationDelay: `${delay}s` }}>
          <text {...a("pop", 1.6 + i * 0.3)} x={x} y={y} fill={[C.mint, C.amber, C.plum][i]} fontSize={24} fontWeight={800} fontFamily={FONT}>♪</text>
        </g>
      ))}
    </g>
  );
}

function DashboardTiles({ scene, paused, still }: SceneProps) {
  const tasks = (scene.chips ?? []).slice(0, 3);
  return (
    <g>
      <rect {...a("fade", 0)} x={20} y={12} width={320} height={196} rx={18} fill={C.deep} stroke={C.line} strokeWidth={2} />
      <text {...a("fade", 0.3)} x={38} y={40} fill={C.cream} fontSize={13} fontWeight={800} fontFamily={FONT}>{(scene.label ?? "Good morning").slice(0, 26)}</text>
      <circle className="fi-pulse" cx={318} cy={35} r={7} fill={C.mint} />
      <g {...a("rise", 0.5)}>
        <rect x={36} y={54} width={150} height={78} rx={14} fill={C.cream} />
        <rect x={50} y={66} width={40} height={5} rx={2.5} fill="#C9C6D3" />
      </g>
      {scene.value && <g {...a("fade", 0.7)}><Counter value={scene.value} x={50} y={100} size={21} delayMs={900} paused={paused} still={still} color={C.navy} /></g>}
      <path {...a("draw", 1.2)} pathLength={1} d="M50 120 L76 114 L100 118 L126 106 L150 110 L172 96" fill="none" stroke={C.teal} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {(tasks.length ? tasks : ["", "", ""]).map((task, i) => (
        <g key={i} {...slide(0.9 + i * 0.35, 24, 0)}>
          <rect x={198} y={54 + i * 27} width={128} height={22} rx={11} fill={C.panel} />
          <circle cx={211} cy={65 + i * 27} r={5} fill={[C.amber, C.mint, C.coral][i]} />
          {task ? (
            <text x={222} y={69 + i * 27} fill={C.cream} fontSize={10} fontWeight={800} fontFamily={FONT}>{task.slice(0, 17)}</text>
          ) : (
            <rect x={222} y={63 + i * 27} width={70} height={5} rx={2.5} fill={C.line} />
          )}
        </g>
      ))}
      <line x1={36} y1={196} x2={324} y2={196} stroke={C.line} strokeWidth={2} />
      {[22, 30, 26, 38, 34, 44, 52].map((height, i) => (
        <rect key={i} {...a("grow", 1.6 + i * 0.12)} x={44 + i * 28} y={196 - height} width={18} height={height} rx={4} fill={i === 6 ? C.mint : C.teal} />
      ))}
      <g {...a("pop", 2.6)}>
        <rect x={250} y={150} width={74} height={36} rx={12} fill={C.mint} />
        <path d="M266 168 l4 -10 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 Z" transform="translate(0 -4) scale(1)" fill={C.navy} />
        <rect x={286} y={162} width={28} height={5} rx={2.5} fill={C.navy} opacity={0.5} />
        <rect x={286} y={172} width={20} height={5} rx={2.5} fill={C.navy} opacity={0.3} />
      </g>
    </g>
  );
}

const ZONES = [
  { x: 104, y: 86, r: 54 },
  { x: 208, y: 120, r: 46 },
  { x: 282, y: 66, r: 40 },
];

function MapZones({ scene, paused, still }: SceneProps) {
  const zones = (scene.chips?.length ? scene.chips : ["Zone A", "Zone B", "Zone C"]).slice(0, 3);
  return (
    <g>
      <rect x={16} y={12} width={328} height={196} rx={18} fill={C.deep} />
      <path d="M16 162 C 90 142, 150 192, 230 170 S 330 152, 344 162 V 196 a12 12 0 0 1 -12 12 H 28 a12 12 0 0 1 -12 -12 Z" fill={C.teal} opacity={0.35} />
      {["M16 60 H344", "M16 128 H344", "M70 12 V208", "M160 12 V208", "M250 12 V208"].map((d) => <path key={d} d={d} stroke={C.panel} strokeWidth={7} />)}
      {zones.map((zone, i) => {
        const off = /✕|×|off/i.test(zone);
        const color = off ? C.coral : [C.mint, C.amber, C.plum][i]!;
        const spot = ZONES[i]!;
        return (
          <g key={zone}>
            <circle {...a("pop", 0.5 + i * 0.45)} cx={spot.x} cy={spot.y} r={spot.r} fill={off ? "none" : color} fillOpacity={0.22} stroke={color} strokeWidth={2} strokeDasharray="5 5" />
            {off && <line {...a("draw", 0.9 + i * 0.45)} pathLength={1} x1={spot.x - spot.r * 0.6} y1={spot.y - spot.r * 0.6} x2={spot.x + spot.r * 0.6} y2={spot.y + spot.r * 0.6} stroke={C.coral} strokeWidth={2.5} strokeDasharray="1" />}
            <Chip x={Math.min(spot.x, 340 - chipWidth(zone, 10.5) / 2)} y={spot.y} text={zone} size={10.5} fill={off ? C.panel : color} color={off ? C.cream : C.navy} delay={0.8 + i * 0.45} kind="pop" />
          </g>
        );
      })}
      <g {...a("pop", 1.8)}>
        <path d="M104 52 c-10 -12 -10 -26 0 -26 s10 14 0 26 Z" fill={C.coral} />
        <circle cx={104} cy={34} r={3.5} fill={C.navy} />
      </g>
      <circle className="fi-ring" style={{ animationDelay: "2s" }} cx={104} cy={86} r={20} fill="none" stroke={C.mint} strokeWidth={2} />
      {scene.value && (
        <At x={300} y={180}>
          <g {...a("pop", 2.4)}>
            <path d="M-40 -15 H26 L38 0 L26 15 H-40 Z" fill={C.cream} />
            <circle cx={26} cy={0} r={3} fill={C.navy} />
            <Counter value={scene.value} x={-8} y={5} size={14} delayMs={2600} paused={paused} still={still} anchor="middle" color={C.navy} />
          </g>
        </At>
      )}
    </g>
  );
}

function BadgeVerify({ scene }: SceneProps) {
  const chips = (scene.chips ?? []).slice(0, 3);
  let cursor = 30;
  const pills = chips.map((chip) => {
    const text = `✓ ${chip}`;
    const x = cursor;
    cursor += chipWidth(text, 10) + 6;
    return { text, x };
  });
  return (
    <g>
      <g {...a("rise", 0.1)}>
        <rect x={30} y={34} width={172} height={120} rx={14} fill={C.cream} />
        <rect x={44} y={50} width={46} height={56} rx={8} fill={C.mintSoft} />
        <circle cx={67} cy={70} r={9} fill={C.navy} />
        <path d="M53 104 a14 12 0 0 1 28 0 Z" fill={C.navy} />
        {[84, 60, 72].map((width, i) => <rect key={i} x={102} y={56 + i * 16} width={width} height={6} rx={3} fill="#C9C6D3" />)}
        <rect x={44} y={120} width={144} height={20} rx={4} fill="#E8E2D5" />
        {Array.from({ length: 22 }, (_, i) => <rect key={i} x={50 + i * 6} y={124} width={i % 3 ? 2 : 3.5} height={12} fill={C.navy} opacity={0.55} />)}
      </g>
      <At x={30} y={38}>
        <g className="fi-loop" style={{ ...v(0, 110), animationDuration: "2.2s", animationDelay: "0.6s" }}>
          <rect x={-4} y={-8} width={180} height={16} fill={C.mint} opacity={0.18} />
          <rect x={-4} y={-1.5} width={180} height={3} rx={1.5} fill={C.mint} />
        </g>
      </At>
      <path {...a("draw", 1.6)} pathLength={1} d="M208 96 H232" stroke={C.mint} strokeWidth={3} strokeDasharray="1" strokeLinecap="round" />
      <g {...a("pop", 2.1)}>
        <path d="M282 30 L324 46 V82 C324 112 304 130 282 138 C260 130 240 112 240 82 V46 Z" fill={C.mint} />
        <path d="M282 44 L312 56 V82 C312 104 298 118 282 124 C266 118 252 104 252 82 V56 Z" fill="none" stroke={C.navy} strokeOpacity={0.25} strokeWidth={2} />
        <Check x={283} y={84} size={1.6} />
      </g>
      <circle className="fi-ring" style={{ animationDelay: "2.5s" }} cx={282} cy={84} r={46} fill="none" stroke={C.mint} strokeWidth={2} />
      {scene.label && <Chip x={282} y={164} text={scene.label} fill={C.cream} color={C.navy} delay={2.6} kind="pop" />}
      {pills.map(({ text, x }, i) => <Chip key={text} x={x} y={180} text={text} anchor="start" size={10} fill={C.panel} color={C.mintSoft} delay={1 + i * 0.35} />)}
    </g>
  );
}

function RiderTeam({ scene }: SceneProps) {
  const names = (scene.chips?.length ? scene.chips : ["Rider 1", "Rider 2", "Rider 3"]).slice(0, 3);
  const busy = (i: number) => i === 1;
  return (
    <g>
      {names.map((name, i) => {
        const x = 24 + i * 108;
        const y = 34;
        return (
          <g key={name}>
            <g {...a("rise", 0.2 + i * 0.25)}>
              <rect x={x} y={y} width={96} height={150} rx={16} fill={C.panel} stroke={i === 0 ? C.mint : C.line} strokeWidth={2} />
              <circle cx={x + 48} cy={y + 42} r={24} fill={[C.mint, C.amber, C.plum][i]} />
              <path d={`M${x + 28} ${y + 42} a20 20 0 0 1 40 0 Z`} fill={C.navy} />
              <rect x={x + 32} y={y + 38} width={32} height={9} rx={4.5} fill={C.cream} opacity={0.85} />
              <text x={x + 48} y={y + 88} fill={C.cream} fontSize={12} fontWeight={800} fontFamily={FONT} textAnchor="middle">{name.slice(0, 12)}</text>
              <rect x={x + 18} y={y + 128} width={60} height={6} rx={3} fill={C.line} />
            </g>
            <circle className={busy(i) ? "fi-pulse" : undefined} cx={x + 48} cy={y + 108} r={6} fill={busy(i) ? C.amber : C.mint} />
            <rect {...a("growx", 1.2 + i * 0.3)} x={x + 18} y={y + 128} width={[52, 34, 46][i]} height={6} rx={3} fill={busy(i) ? C.amber : C.mint} />
            {busy(i) && (
              <g {...a("pop", 1.6)}>
                <rect x={x + 64} y={y + 10} width={22} height={18} rx={3} fill={C.amber} stroke={C.navy} strokeWidth={2} />
                <path d={`M${x + 64} ${y + 16} H${x + 86}`} stroke={C.navy} strokeWidth={2} />
              </g>
            )}
          </g>
        );
      })}
      <rect className="fi-ring" style={{ animationDelay: "2.2s" }} x={24} y={34} width={96} height={150} rx={16} fill="none" stroke={C.mint} strokeWidth={2} />
      <g {...a("pop", 2.6)}>
        <circle cx={180} cy={204} r={11} fill={C.mint} />
        <path d="M174 204 h12 M180 198 v12" stroke={C.navy} strokeWidth={2.5} strokeLinecap="round" />
      </g>
    </g>
  );
}

function InboxList({ scene }: SceneProps) {
  const chips = scene.chips ?? [];
  const rows = Math.max(3, Math.min(4, chips.length || 4));
  return (
    <g>
      <rect {...a("fade", 0)} x={36} y={12} width={288} height={196} rx={18} fill={C.deep} stroke={C.line} strokeWidth={2} />
      <rect x={54} y={26} width={72} height={8} rx={4} fill={C.cream} opacity={0.75} />
      {scene.value && (
        <g {...a("pop", 1.8)}>
          <circle cx={300} cy={30} r={11} fill={C.coral} />
          <text x={300} y={34} fill={C.cream} fontSize={11} fontWeight={800} fontFamily={FONT} textAnchor="middle">{scene.value.slice(0, 3)}</text>
        </g>
      )}
      {Array.from({ length: rows }, (_, i) => {
        const top = 48 + i * 39;
        const chip = chips[i];
        return (
          <g key={i} {...slide(0.3 + i * 0.3, 0, 12)}>
            <rect x={48} y={top} width={264} height={32} rx={12} fill={C.panel} stroke={i === 0 ? C.mint : "none"} strokeWidth={1.5} />
            <circle cx={66} cy={top + 16} r={10} fill={chipColor(chip ?? "", i)} />
            {chip ? (
              <text x={84} y={top + 14} fill={C.cream} fontSize={10.5} fontWeight={800} fontFamily={FONT}>{chip.slice(0, 18)}</text>
            ) : (
              <rect x={84} y={top + 8} width={60} height={6} rx={3} fill={C.cream} opacity={0.6} />
            )}
            {i === 0 && scene.label ? (
              <text x={84} y={top + 26} fill={C.mintSoft} fontSize={9} fontFamily={MONO}>{scene.label.slice(0, 30)}</text>
            ) : (
              <rect x={84} y={top + 20} width={130 - i * 16} height={4} rx={2} fill={C.line} />
            )}
            {i < 2 && <circle className={i === 0 ? "fi-pulse" : undefined} cx={296} cy={top + 16} r={4.5} fill={C.mint} />}
          </g>
        );
      })}
    </g>
  );
}

function BellAlerts({ scene }: SceneProps) {
  const alerts = (scene.chips?.length ? scene.chips : ["", "", ""]).slice(0, 3);
  return (
    <g>
      <g className="fi-swing">
        <g {...a("pop", 0.1)}>
          <circle cx={70} cy={70} r={5} fill={C.amber} />
          <path d="M50 124 C50 88 58 74 70 74 C82 74 90 88 90 124 L98 132 H42 Z" fill={C.amber} />
          <circle cx={70} cy={140} r={6} fill={C.amber} />
        </g>
      </g>
      <circle className="fi-ring" style={{ animationDelay: "0.4s" }} cx={70} cy={106} r={34} fill="none" stroke={C.amber} strokeWidth={2} />
      <g {...a("pop", 0.6)}>
        <circle cx={92} cy={78} r={10} fill={C.coral} />
        <text x={92} y={82} fill={C.cream} fontSize={11} fontWeight={800} fontFamily={FONT} textAnchor="middle">{alerts.length}</text>
      </g>
      {alerts.map((alert, i) => {
        const top = 30 + i * 56;
        return (
          <g key={i} {...slide(0.8 + i * 0.6, 40, 0)}>
            <rect x={128} y={top} width={212} height={46} rx={14} fill={i === 0 ? C.cream : C.panel} />
            <circle cx={150} cy={top + 23} r={11} fill={[C.mint, C.amber, C.coral][i]} />
            {alert ? (
              <text x={170} y={top + 21} fill={i === 0 ? C.navy : C.cream} fontSize={10.5} fontWeight={800} fontFamily={FONT}>{alert.slice(0, 24)}</text>
            ) : (
              <rect x={170} y={top + 15} width={110} height={6} rx={3} fill={i === 0 ? "#C9C6D3" : C.line} />
            )}
            <rect x={170} y={top + 29} width={[70, 54, 62][i]} height={4} rx={2} fill={i === 0 ? "#C9C6D3" : C.line} />
          </g>
        );
      })}
    </g>
  );
}

function SearchRank({ scene, paused, still }: SceneProps) {
  const query = (scene.label ?? "your shop").slice(0, 24);
  const typed = 1 + query.length * 0.085;
  return (
    <g>
      <g {...a("rise", 0.1)}>
        <rect x={30} y={16} width={300} height={38} rx={19} fill={C.cream} />
        <circle cx={52} cy={34} r={6.5} fill="none" stroke={C.navy} strokeWidth={2.5} />
        <path d="M57 39 l6 6" stroke={C.navy} strokeWidth={2.5} strokeLinecap="round" />
        {[C.mint, C.amber, C.coral, C.plum].map((color, i) => <circle key={color} cx={290 + i * 9} cy={35} r={3.5} fill={color} />)}
      </g>
      <Typed text={query} x={70} y={40} delayMs={1000} paused={paused} still={still} size={12} color={C.navy} cursor={C.teal} />
      {[1, 2].map((slot) => (
        <g key={slot} {...a("rise", typed + 0.2 + slot * 0.2)}>
          <rect x={30} y={70 + slot * 46} width={300} height={38} rx={12} fill={C.panel} />
          <circle cx={50} cy={89 + slot * 46} r={8} fill={C.line} />
          <rect x={66} y={80 + slot * 46} width={130 - slot * 20} height={6} rx={3} fill={C.line} />
          <rect x={66} y={92 + slot * 46} width={180} height={4} rx={2} fill={C.line} opacity={0.6} />
        </g>
      ))}
      <g {...slide(typed + 0.9, 0, 92, { animationDuration: "1s" })}>
        <rect x={30} y={70} width={300} height={38} rx={12} fill={C.cream} stroke={C.mint} strokeWidth={2.5} />
        <circle cx={50} cy={89} r={8} fill={C.teal} />
        <rect x={66} y={80} width={150} height={6} rx={3} fill={C.navy} />
        <rect x={66} y={92} width={92} height={4} rx={2} fill={C.teal} />
        <circle cx={310} cy={89} r={11} fill={C.amber} />
        <text x={310} y={93} fill={C.navy} fontSize={11} fontWeight={800} fontFamily={FONT} textAnchor="middle">1</text>
      </g>
      <g {...a("pop", typed + 2)}>
        <path d="M344 100 V76 M336 84 L344 76 L352 84" fill="none" stroke={C.mint} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </g>
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
  "order-pipeline": OrderPipeline,
  "receipt": Receipt,
  "invoice-paper": InvoicePaper,
  "star-reviews": StarReviews,
  "customer-cards": CustomerCards,
  "discount-ticket": DiscountTicket,
  "brand-palette": BrandPalette,
  "import-ship": ImportShip,
  "video-reel": VideoReel,
  "dashboard-tiles": DashboardTiles,
  "map-zones": MapZones,
  "badge-verify": BadgeVerify,
  "rider-team": RiderTeam,
  "inbox-list": InboxList,
  "bell-alerts": BellAlerts,
  "search-rank": SearchRank,
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
