"use client";

import { Mascot } from "@/components/brand/Mascot";
import { mascotStill, type MascotMood, type MascotStillName, type MascotWho } from "@shared/mascots";
import type React from "react";

// Peggy and Rex on the app's own 404 and error pages: the real mascot renders, with small SVG props drawn
// around them (Rex's spanner, sparks and gears; Peggy's magnifier and question marks). Everything sits on the
// 320×200 grid of ErrorScene's 8:5 stage, so nothing moves the page, and errors.css animates it (transforms and
// opacity only; still under reduced motion). Decorative: the page's text says what happened.
// Storefront pages never use these; shoppers see the store's own brand.

const INK = "var(--sx-ink)";
const ACCENT = "var(--sx-accent)";
const WARM = "var(--sx-warm)";
const PAPER = "var(--sx-paper)";

const STAGE_W = 320;
const STAGE_H = 200;

/** Where the character sits inside each square render, in % of its side (the renders have wide transparent margins). */
interface Crop { x: number; y: number; w: number; h: number }

// Rex and Peggy are drawn by the shared <Mascot> in their "oops" mood (build spec 5.4), so the real animation takes
// over here when it lands. The scene animates the sprite itself, so the mascot's own fallback motion is off.
const SPRITES: Record<MascotWho, { mood: MascotMood }> = {
  rex: { mood: "oops" },
  // Side-on, looking ahead: Peggy on the hunt.
  peggy: { mood: "oops" },
};

/** Where the character sits inside each square still, in % of its side (the renders have wide transparent margins). */
const CROPS: Partial<Record<MascotStillName, Crop>> = {
  rex: { x: 23.8, y: 19.1, w: 52.1, h: 65.3 },
  peggy: { x: 29.7, y: 23.8, w: 40, h: 49.3 },
  "peggy-side": { x: 30.7, y: 24.1, w: 36, h: 51 },
};
const WHOLE: Crop = { x: 0, y: 0, w: 100, h: 100 };

type SpriteName = MascotWho;

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

/**
 * A mascot cropped to its own outline and placed on the stage grid: `x`/`top` are its top-left corner and
 * `height` its height, all in stage units. The outer box carries the motion classes; `flip` mirrors it.
 */
function Sprite({ name, x, top, height, motion, tilt, flip = false }: { name: SpriteName; x: number; top: number; height: number; motion?: string; tilt?: string; flip?: boolean }) {
  const { mood } = SPRITES[name];
  const crop = CROPS[mascotStill(name, mood)] ?? WHOLE;
  const box: React.CSSProperties = {
    left: pct(x, STAGE_W),
    top: pct(top, STAGE_H),
    height: pct(height, STAGE_H),
    aspectRatio: `${crop.w} / ${crop.h}`,
  };
  return (
    <div className={`sbx-sprite absolute ${motion ?? ""}`} style={box}>
      <div className={`relative h-full w-full overflow-hidden ${tilt ?? ""}`} style={flip ? { scale: "-1 1" } : undefined}>
        <Mascot
          who={name}
          mood={mood}
          decorative
          still
          className="pointer-events-none absolute select-none"
          style={{
            width: `${(100 / crop.w) * 100}%`,
            height: "auto",
            aspectRatio: "1 / 1",
            maxWidth: "none",
            left: `${(-crop.x / crop.w) * 100}%`,
            top: `${(-crop.y / crop.h) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

/** A spur gear centred on (cx, cy): `teeth` square-ish teeth around a body of radius `r`. */
function gearPath(cx: number, cy: number, r: number, teeth: number) {
  const outer = r + Math.max(2.5, r * 0.28);
  const step = (Math.PI * 2) / teeth;
  const points: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step;
    const corners: [number, number][] = [
      [r, a],
      [outer, a + step * 0.12],
      [outer, a + step * 0.42],
      [r, a + step * 0.54],
    ];
    for (const [radius, angle] of corners) points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

function Gear({ cx, cy, r, teeth, className, fill = ACCENT }: { cx: number; cy: number; r: number; teeth: number; className: string; fill?: string }) {
  return (
    <g className={className}>
      <path d={gearPath(cx, cy, r, teeth)} fill={fill} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r * 0.38} fill={PAPER} stroke={INK} strokeWidth={2} />
    </g>
  );
}

/** Soft ground shadow that breathes with the character above it. */
function Shadow({ cx, cy, rx, className }: { cx: number; cy: number; rx: number; className: string }) {
  return <ellipse className={className} cx={cx} cy={cy} rx={rx} ry={rx * 0.14} fill={INK} fillOpacity={0.16} />;
}

/** A three-ray spark burst at (x, y); each ray pops on its own beat. */
function Sparks({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className="sbx-a-spark" d="M0-7V-14" stroke={WARM} strokeWidth={3} strokeLinecap="round" />
      <path className="sbx-a-spark2" d="M6-4l7-5" stroke={WARM} strokeWidth={3} strokeLinecap="round" />
      <path className="sbx-a-spark3" d="M-6-4l-7-5" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
      <path className="sbx-a-spark2" d="M7 3l8 2" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  );
}

/** A lightning bolt that flickers like a dodgy socket. */
function Bolt({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path className="sbx-a-zap" d="M6 0L-6 16H2L-3 30L10 11H2Z" fill={WARM} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
    </g>
  );
}

/** An open-ended spanner lying along the x axis from (0, 0) (handle end) to (len, 0) (jaw). */
function Spanner({ len }: { len: number }) {
  return (
    <g>
      <rect x={-4} y={-4.5} width={len - 6} height={9} rx={4.5} fill={INK} />
      <path d={`M${len - 10} -9a11 11 0 1 0 0 18l4-5h6v-8h-6z`} fill={INK} />
      <circle cx={2} cy={0} r={2} fill={PAPER} />
    </g>
  );
}

/** A magnifying glass with its handle at (0, 0) and the lens out along +x. */
function Magnifier({ len = 34, r = 15 }: { len?: number; r?: number }) {
  const cx = len + r;
  return (
    <g>
      <path d={`M0 0L${len} 0`} stroke={INK} strokeWidth={7} strokeLinecap="round" />
      <circle cx={cx} cy={0} r={r} fill={PAPER} fillOpacity={0.55} stroke={INK} strokeWidth={4.5} />
      <path className="sbx-a-glint" d={`M${cx - r * 0.55} ${-r * 0.2}a${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.45} ${-r * 0.4}`} fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function QuestionMark({ x, y, size, className, fill = INK }: { x: number; y: number; size: number; className: string; fill?: string }) {
  return (
    <text className={className} x={x} y={y} textAnchor="middle" fontSize={size} fontWeight={700} fill={fill} style={{ fontFamily: "var(--font-display), inherit" }}>
      ?
    </text>
  );
}

function Stage({ back, front, children }: { back: React.ReactNode; front: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0" aria-hidden>
      <svg className="absolute inset-0" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width="100%" height="100%" focusable="false">{back}</svg>
      {children}
      <svg className="pointer-events-none absolute inset-0" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} width="100%" height="100%" focusable="false">{front}</svg>
    </div>
  );
}

/** Rex at the fuse box with his spanner: he wobbles with effort, gears turn, sparks pop. (App and portal errors.) */
export function RexFixingScene() {
  return (
    <Stage
      back={
        <>
          <line x1={24} y1={186} x2={296} y2={186} stroke={INK} strokeOpacity={0.12} strokeWidth={2} strokeLinecap="round" />
          <Shadow cx={138} cy={186} rx={52} className="sbx-a-shadow-rex" />
          {/* The fuse box Rex is working on. */}
          <rect x={222} y={128} width={66} height={58} rx={9} fill={PAPER} stroke={INK} strokeWidth={2.5} />
          <path d="M232 170h22M232 177h14" stroke={INK} strokeOpacity={0.3} strokeWidth={2.5} strokeLinecap="round" />
          <circle className="sbx-a-flicker" cx={276} cy={140} r={4.5} fill={WARM} />
          <Gear cx={254} cy={102} r={14} teeth={9} className="sbx-a-gear" />
          <Gear cx={277} cy={82} r={9} teeth={7} className="sbx-a-gear-rev" fill={WARM} />
          <Bolt x={62} y={30} scale={0.9} />
        </>
      }
      front={
        <>
          {/* Spanner from Rex's hand to the bolt on the box, turning about the bolt. */}
          <g className="sbx-a-wrench" style={{ transformBox: "view-box", transformOrigin: "238px 150px" }}>
            <g transform="translate(190 154) rotate(-5)">
              <Spanner len={50} />
            </g>
          </g>
          <path d="M233 145l5-3 5 3v6l-5 3-5-3z" fill={WARM} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
          <Sparks x={244} y={140} />
          <g className="sbx-a-roll">
            <path d="M44 177l6-3.5 6 3.5v7l-6 3.5-6-3.5z" fill={INK} fillOpacity={0.5} />
          </g>
        </>
      }
    >
      <Sprite name="rex" x={80} top={36} height={150} motion="sbx-a-rex" />
    </Stage>
  );
}

/** Peggy on the hunt with her magnifier: she bobs, tilts her head, sweeps the floor, question marks drift up. (404s.) */
export function PeggySearchingScene() {
  return (
    <Stage
      back={
        <>
          <line x1={24} y1={186} x2={296} y2={186} stroke={INK} strokeOpacity={0.12} strokeWidth={2} strokeLinecap="round" />
          <Shadow cx={128} cy={186} rx={42} className="sbx-a-shadow-peggy" />
          {/* Footprints from where she's already looked. */}
          <g fill={INK} fillOpacity={0.12}>
            <ellipse cx={36} cy={190} rx={4} ry={1.8} />
            <ellipse cx={48} cy={194} rx={4} ry={1.8} />
            <ellipse cx={60} cy={189} rx={4} ry={1.8} />
            <ellipse cx={72} cy={193} rx={4} ry={1.8} />
          </g>
          <ellipse className="sbx-a-lens-spot" cx={226} cy={187} rx={22} ry={3} fill={ACCENT} fillOpacity={0.35} />
        </>
      }
      front={
        <>
          <g className="sbx-a-sweep" style={{ transformBox: "view-box", transformOrigin: "168px 130px" }}>
            <g transform="translate(168 130) rotate(30)">
              <Magnifier len={36} r={17} />
            </g>
          </g>
          <QuestionMark x={182} y={52} size={30} className="sbx-a-q" />
          <QuestionMark x={232} y={78} size={22} className="sbx-a-q2" fill={ACCENT} />
          <QuestionMark x={96} y={44} size={18} className="sbx-a-q3" />
        </>
      }
    >
      <Sprite name="peggy" x={75} top={45} height={140} motion="sbx-a-peggy" tilt="sbx-a-headtilt" />
    </Stage>
  );
}

/** Rex is fixing, Peggy is looking. (The global error, when the whole app fell over.) */
export function RexAndPeggyScene() {
  return (
    <Stage
      back={
        <>
          <line x1={16} y1={186} x2={304} y2={186} stroke={INK} strokeOpacity={0.12} strokeWidth={2} strokeLinecap="round" />
          <Shadow cx={88} cy={186} rx={44} className="sbx-a-shadow-rex" />
          <Shadow cx={240} cy={186} rx={34} className="sbx-a-shadow-peggy" />
          <Gear cx={150} cy={50} r={13} teeth={9} className="sbx-a-gear" />
          <Gear cx={171} cy={34} r={8} teeth={7} className="sbx-a-gear-rev" fill={WARM} />
          <Bolt x={30} y={24} scale={0.75} />
          <ellipse className="sbx-a-lens-spot" cx={170} cy={187} rx={18} ry={2.6} fill={ACCENT} fillOpacity={0.35} />
        </>
      }
      front={
        <>
          {/* Rex's spanner held up and turning; Peggy's magnifier sweeping the floor between them. */}
          <g className="sbx-a-wrench" style={{ transformBox: "view-box", transformOrigin: "126px 156px" }}>
            <g transform="translate(126 156) rotate(-38)">
              <Spanner len={40} />
            </g>
          </g>
          <Sparks x={160} y={126} />
          <g className="sbx-a-sweep" style={{ transformBox: "view-box", transformOrigin: "212px 148px" }}>
            <g transform="translate(212 148) rotate(152)">
              <Magnifier len={26} r={13} />
            </g>
          </g>
          <QuestionMark x={262} y={58} size={24} className="sbx-a-q" />
          <QuestionMark x={214} y={70} size={17} className="sbx-a-q2" fill={ACCENT} />
        </>
      }
    >
      <Sprite name="rex" x={36} top={58} height={128} motion="sbx-a-rex" />
      <Sprite name="peggy" x={200} top={74} height={112} motion="sbx-a-peggy" tilt="sbx-a-headtilt" flip />
    </Stage>
  );
}
