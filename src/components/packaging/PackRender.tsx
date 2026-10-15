"use client";

import { useId, type ReactNode } from "react";
import QRCode from "qrcode";
import "./pack-fonts.css";
import { barcodeBars } from "@shared/barcodes";
import {
  BLEED_MM,
  PACK_STYLE_INFO,
  PRODUCT_TYPE_INFO,
  SAFE_MM,
  fitFontSize,
  infoBlocks,
  layoutInfo,
  packLayout,
  readableOn,
  wrapText,
  type FontRole,
  type PackDesign,
  type PackLayout,
  type PackPanel,
} from "@shared/packaging";

// Draws a pack design as one SVG in millimetres: the flat print sheet (every panel, with bleed) or just the front.
// The same drawing is the live preview, the template samples and the print export (src/components/packaging/export.ts).

export const FONT: Record<FontRole, string> = {
  condensed: "'Anton', Impact, 'Arial Narrow', sans-serif",
  heavy: "'Archivo Black', 'Arial Black', sans-serif",
  serif: "'Fraunces', Georgia, serif",
  script: "'Caveat', 'Segoe Script', cursive",
  round: "'Fredoka', 'Plus Jakarta Sans', sans-serif",
  sans: "'Plus Jakarta Sans', 'Space Grotesk', system-ui, sans-serif",
};

export interface CodeSpot {
  x: number;
  y: number;
  w: number;
  h: number;
  value: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackRenderProps {
  design: PackDesign;
  /** flat = the whole print sheet with bleed; front = the front panel only (samples, thumbnails). */
  view?: "flat" | "front";
  /** Bleed, safe zone, cut and fold lines, seal zones (on screen only). */
  guides?: boolean;
  className?: string;
  /** CSS size: millimetres become pixels at 96 dpi (for export), or fill the parent. */
  pixelSize?: boolean;
}

export function PackRender({ design, view = "flat", guides = false, className, pixelSize = false }: PackRenderProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const layout = packLayout(design.format, design.size);
  const front = layout.panels.find((panel) => panel.role === "front")!;
  const bleed = view === "flat" ? BLEED_MM : 0;
  const vb = view === "flat" ? { x: -bleed, y: -bleed, w: layout.width + bleed * 2, h: layout.height + bleed * 2 } : { x: front.x, y: front.y, w: front.w, h: front.h };
  const ctx: Ctx = { design, layout, uid, hasInfo2: layout.panels.some((panel) => panel.role === "info2") };
  const round = design.format === "round_sticker";
  const panels = view === "flat" ? layout.panels : [front];
  const sheetClip = round ? <circle cx={layout.width / 2} cy={layout.height / 2} r={layout.width / 2 + bleed} /> : <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} />;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className={className}
      style={pixelSize ? { width: `${(vb.w * 96) / 25.4}px`, height: `${(vb.h * 96) / 25.4}px` } : undefined}
      role="img"
      aria-label={`${design.content.brand} ${design.content.name}`.trim() || "Packaging design"}
    >
      <defs>
        <clipPath id={`${uid}-sheet`}>{sheetClip}</clipPath>
        <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id={`${uid}-rough`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="0.45" />
        </filter>
        {panels.map((panel) => (
          <clipPath key={panel.id} id={`${uid}-p-${panel.id}`}>
            {round ? <circle cx={layout.width / 2} cy={layout.height / 2} r={layout.width / 2 + bleed} /> : <BoxRect box={bleedBox(panel, layout, bleed)} />}
          </clipPath>
        ))}
      </defs>
      <g clipPath={`url(#${uid}-sheet)`}>
        <rect x={vb.x - 1} y={vb.y - 1} width={vb.w + 2} height={vb.h + 2} fill={design.colours.ground} />
        <Texture ctx={ctx} box={vb} />
        {panels.map((panel) => (
          <g key={panel.id} clipPath={`url(#${uid}-p-${panel.id})`}>
            <PanelArt ctx={ctx} panel={panel} bleedRect={bleedBox(panel, layout, bleed)} />
          </g>
        ))}
      </g>
      {guides && view === "flat" ? <Guides layout={layout} /> : null}
    </svg>
  );
}

function BoxRect({ box }: { box: Box }) {
  return <rect x={box.x} y={box.y} width={box.w} height={box.h} />;
}

interface Ctx {
  design: PackDesign;
  layout: PackLayout;
  uid: string;
  hasInfo2: boolean;
}

/** The panel's rectangle grown into the bleed on the sides that touch the sheet edge. */
function bleedBox(panel: PackPanel, layout: PackLayout, bleed: number): Box {
  const left = panel.x <= 0.01 ? bleed : 0;
  const top = panel.y <= 0.01 ? bleed : 0;
  const right = panel.x + panel.w >= layout.width - 0.01 ? bleed : 0;
  const bottom = panel.y + panel.h >= layout.height - 0.01 ? bleed : 0;
  return { x: panel.x - left, y: panel.y - top, w: panel.w + left + right, h: panel.h + top + bottom };
}

/** Where words may go: inside the safe zone and clear of seals. */
export function contentBox(panel: PackPanel, layout: PackLayout): Box {
  let top = SAFE_MM;
  let bottom = SAFE_MM;
  let left = SAFE_MM;
  let right = SAFE_MM;
  for (const seal of layout.seals) {
    const overlapsX = seal.x < panel.x + panel.w && seal.x + seal.w > panel.x;
    const overlapsY = seal.y < panel.y + panel.h && seal.y + seal.h > panel.y;
    if (!overlapsX || !overlapsY) continue;
    const wide = seal.w >= panel.w * 0.6;
    if (wide && seal.y <= panel.y + 0.01) top = Math.max(top, seal.y + seal.h - panel.y + 2);
    else if (wide && seal.y + seal.h >= panel.y + panel.h - 0.01) bottom = Math.max(bottom, panel.y + panel.h - seal.y + 2);
    else if (seal.x <= panel.x + 0.01) left = Math.max(left, seal.x + seal.w - panel.x + 1.5);
    else if (seal.x + seal.w >= panel.x + panel.w - 0.01) right = Math.max(right, panel.x + panel.w - seal.x + 1.5);
  }
  if (layout.circles.length) {
    // A round sticker: keep to the square inside the circle.
    const inset = panel.w * 0.16;
    return { x: panel.x + inset, y: panel.y + inset, w: panel.w - inset * 2, h: panel.h - inset * 2 };
  }
  return { x: panel.x + left, y: panel.y + top, w: Math.max(4, panel.w - left - right), h: Math.max(4, panel.h - top - bottom) };
}

function Texture({ ctx, box }: { ctx: Ctx; box: Box }) {
  const { style } = ctx.design;
  if (style !== "midnight" && style !== "kraft" && ctx.design.finish !== "kraft") return null;
  return <rect x={box.x} y={box.y} width={box.w} height={box.h} filter={`url(#${ctx.uid}-grain)`} opacity={style === "midnight" ? 0.14 : 0.22} style={{ mixBlendMode: "multiply" }} />;
}

function PanelArt({ ctx, panel, bleedRect }: { ctx: Ctx; panel: PackPanel; bleedRect: Box }) {
  const box = contentBox(panel, ctx.layout);
  switch (panel.role) {
    case "front":
      return <Front ctx={ctx} box={box} full={bleedRect} />;
    case "info":
      return <Info ctx={ctx} box={box} part={ctx.hasInfo2 ? "words" : "all"} />;
    case "info2":
      return <Info ctx={ctx} box={box} part="codes" />;
    case "side":
      return <Side ctx={ctx} box={box} />;
    default:
      return <Plain ctx={ctx} box={box} />;
  }
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function Txt({ x, y, size, role, fill, children, anchor = "middle", weight, spacing, italic, rotate, filter, opacity }: { x: number; y: number; size: number; role: FontRole; fill: string; children: ReactNode; anchor?: "start" | "middle" | "end"; weight?: number; spacing?: number; italic?: boolean; rotate?: number; filter?: string; opacity?: number }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontFamily={FONT[role]}
      fontWeight={weight ?? (role === "sans" ? 700 : role === "serif" ? 600 : 400)}
      fill={fill}
      textAnchor={anchor}
      letterSpacing={spacing}
      fontStyle={italic ? "italic" : undefined}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
      filter={filter}
      opacity={opacity}
    >
      {children}
    </text>
  );
}

/** Splits a name over two lines: first word, then the rest (or a long single word stays one line). */
function nameLines(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [name.trim() || "Product"];
  if (words.length === 2) return words;
  const first = words.slice(0, Math.ceil(words.length / 2)).join(" ");
  return [first, words.slice(Math.ceil(words.length / 2)).join(" ")];
}

function Logo({ ctx, x, y, w, h, colour, role = "sans", anchor = "middle" }: { ctx: Ctx; x: number; y: number; w: number; h: number; colour: string; role?: FontRole; anchor?: "start" | "middle" }) {
  const { design } = ctx;
  if (design.showLogo && design.logoUrl) {
    return <image href={design.logoUrl} x={anchor === "middle" ? x - w / 2 : x} y={y} width={w} height={h} preserveAspectRatio={anchor === "middle" ? "xMidYMid meet" : "xMinYMid meet"} />;
  }
  const brand = (design.content.brand || "Your brand").toUpperCase();
  const size = fitFontSize(brand, w, h * 0.8, role) * 0.95;
  return (
    <Txt x={x} y={y + h * 0.72} size={size} role={role} fill={colour} anchor={anchor} spacing={size * 0.12}>
      {brand}
    </Txt>
  );
}

function Photo({ ctx, cx, cy, r, shape, ring }: { ctx: Ctx; cx: number; cy: number; r: number; shape: "bowl" | "cutout" | "arch"; ring?: string }) {
  const { design, uid } = ctx;
  const id = `${uid}-ph-${Math.round(cx * 10)}-${Math.round(cy * 10)}`;
  const url = design.image && design.image.fit !== "none" ? design.image.url : null;
  if (!url) return null;
  const fit = design.image?.fit ?? shape;
  if (fit === "cutout") {
    // A photo in a soft rounded frame (product photos usually have their own background).
    return (
      <g>
        <clipPath id={id}>
          <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.22} />
        </clipPath>
        <rect x={cx - r * 1.04} y={cy - r * 1.04} width={r * 2.08} height={r * 2.08} rx={r * 0.24} fill="#FFFFFF" opacity={0.9} />
        <image href={url} x={cx - r} y={cy - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      </g>
    );
  }
  if (fit === "arch" || shape === "arch") {
    const path = `M ${cx - r} ${cy + r * 1.25} L ${cx - r} ${cy - r * 0.25} A ${r} ${r} 0 0 1 ${cx + r} ${cy - r * 0.25} L ${cx + r} ${cy + r * 1.25} Z`;
    return (
      <g>
        <clipPath id={id}>
          <path d={path} />
        </clipPath>
        <image href={url} x={cx - r} y={cy - r * 1.25} width={r * 2} height={r * 2.5} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      </g>
    );
  }
  return (
    <g>
      {ring ? <circle cx={cx} cy={cy} r={r * 1.06} fill={ring} /> : null}
      <clipPath id={id}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <image href={url} x={cx - r} y={cy - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
    </g>
  );
}

function Leaf({ cx, cy, size, fill, rotate = 0 }: { cx: number; cy: number; size: number; fill: string; rotate?: number }) {
  return (
    <g transform={`rotate(${rotate} ${cx} ${cy})`}>
      <path d={`M ${cx} ${cy - size / 2} C ${cx + size * 0.4} ${cy - size * 0.2}, ${cx + size * 0.4} ${cy + size * 0.2}, ${cx} ${cy + size / 2} C ${cx - size * 0.4} ${cy + size * 0.2}, ${cx - size * 0.4} ${cy - size * 0.2}, ${cx} ${cy - size / 2} Z`} fill={fill} />
      <line x1={cx} y1={cy - size * 0.42} x2={cx} y2={cy + size * 0.42} stroke="rgba(0,0,0,0.18)" strokeWidth={size * 0.03} />
    </g>
  );
}

function Claims({ ctx, x, y, w, size, colour, role = "sans", bullet }: { ctx: Ctx; x: number; y: number; w: number; size: number; colour: string; role?: FontRole; bullet?: string }) {
  const claims = ctx.design.content.claims.slice(0, 3);
  return (
    <g>
      {claims.map((claim, index) => {
        const fs = Math.min(size, fitFontSize(claim, w - size * 1.4, size, role));
        return (
          <g key={index}>
            {bullet ? <circle cx={x + fs * 0.35} cy={y + index * size * 1.5 - fs * 0.34} r={fs * 0.3} fill={bullet} /> : null}
            <Txt x={x + (bullet ? fs * 1.1 : 0)} y={y + index * size * 1.5} size={fs} role={role} fill={colour} anchor="start" weight={700}>
              {claim}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Net({ ctx, x, y, size, colour, anchor = "end", role = "sans" }: { ctx: Ctx; x: number; y: number; size: number; colour: string; anchor?: "start" | "middle" | "end"; role?: FontRole }) {
  if (!ctx.design.content.netContent) return null;
  return (
    <Txt x={x} y={y} size={size} role={role} fill={colour} anchor={anchor} weight={700} spacing={size * 0.04}>
      {ctx.design.content.netContent}
    </Txt>
  );
}

// ─── Fronts, one per style ───────────────────────────────────────────────────

function Front({ ctx, box: area, full }: { ctx: Ctx; box: Box; full: Box }) {
  const { design, uid } = ctx;
  // A wide front (jar wrap, sleeve) is laid out as a centred portrait column; bands and patterns still span it all.
  const box = area.w > area.h * 0.9 ? { x: area.x + area.w / 2 - area.h * 0.42, y: area.y, w: area.h * 0.84, h: area.h } : area;
  const { colours, content } = design;
  const info = PACK_STYLE_INFO[design.style];
  const display = info.display;
  const lines = nameLines(content.name || "Product name");
  const u = Math.min(box.w, box.h);
  const cx = box.x + box.w / 2;
  const tall = box.h > box.w * 1.15;
  const name = (maxW: number, maxSize: number, role: FontRole = display) => Math.min(...lines.map((line) => fitFontSize(line.toUpperCase(), maxW, maxSize, role)));

  switch (design.style) {
    case "midnight": {
      const size = name(box.w * 0.9, u * (tall ? 0.2 : 0.17));
      const bandTop = box.y + box.h * 0.8;
      const teeth = Array.from({ length: 24 }, (_, i) => `${full.x + (i * full.w) / 23} ${bandTop + (i % 2 ? 1.6 : -1.2)}`).join(" L ");
      const photoR = Math.min(box.w * 0.28, box.h * 0.15);
      const stamp = wrapText(content.claims[0] ?? "Fresh", 13).slice(0, 2);
      return (
        <g>
          <Leaf cx={box.x + box.w * 0.84} cy={box.y + box.h * 0.08} size={u * 0.14} fill="#3E7A3A" rotate={35} />
          <Logo ctx={ctx} x={cx} y={box.y + box.h * 0.05} w={box.w * 0.6} h={u * 0.09} colour={colours.accent} />
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.13 + size * (i + 1) * 0.98} size={size} role={display} fill={i === 0 ? colours.ink : colours.accent} filter={`url(#${uid}-rough)`}>
              {line.toUpperCase()}
            </Txt>
          ))}
          <g transform={`rotate(-12 ${box.x + box.w * 0.2} ${box.y + box.h * 0.66})`}>
            <circle cx={box.x + box.w * 0.2} cy={box.y + box.h * 0.66} r={u * 0.12} fill="none" stroke={colours.ink} strokeWidth={u * 0.008} />
            {stamp.map((line, i) => (
              <Txt key={i} x={box.x + box.w * 0.2} y={box.y + box.h * 0.66 + u * 0.025 + (i - (stamp.length - 1) / 2) * u * 0.06} size={Math.min(...stamp.map((l) => fitFontSize(l, u * 0.2, u * 0.065, "script")))} role="script" fill={colours.ink} weight={700}>
                {line}
              </Txt>
            ))}
          </g>
          <Photo ctx={ctx} cx={box.x + box.w * 0.66} cy={box.y + box.h * 0.8 - photoR * 0.55} r={photoR} shape="bowl" ring="#3B2618" />
          <path d={`M ${full.x} ${full.y + full.h} L ${teeth} L ${full.x + full.w} ${full.y + full.h} Z`} fill={colours.accent} />
          {wrapText(content.variant || content.tagline, 22).slice(0, 2).map((line, i) => (
            <Txt key={i} x={box.x} y={bandTop + u * 0.07 + i * u * 0.055} size={Math.min(u * 0.05, fitFontSize(line, box.w * 0.62, u * 0.05, "serif"))} role="serif" fill={readableOn(colours.accent)} anchor="start" weight={700}>
              {line.toUpperCase()}
            </Txt>
          ))}
          <Net ctx={ctx} x={box.x + box.w} y={box.y + box.h - u * 0.01} size={u * 0.035} colour={readableOn(colours.accent)} />
        </g>
      );
    }
    case "range": {
      const size = name(box.w * 0.9, u * 0.22);
      const tagW = box.w * 0.34;
      return (
        <g>
          <Logo ctx={ctx} x={cx} y={box.y + box.h * 0.02} w={box.w * 0.4} h={u * 0.1} colour={colours.ink} />
          <g transform={`rotate(8 ${box.x + box.w - tagW / 2} ${box.y + box.h * 0.17})`}>
            <rect x={box.x + box.w - tagW} y={box.y + box.h * 0.14} width={tagW} height={u * 0.08} rx={u * 0.012} fill="#FFFFFF" />
            <Txt x={box.x + box.w - tagW / 2} y={box.y + box.h * 0.14 + u * 0.055} size={fitFontSize((content.claims[0] ?? "").toUpperCase(), tagW * 0.9, u * 0.04, "sans")} role="sans" fill={colours.accent}>
              {(content.claims[0] ?? "").toUpperCase()}
            </Txt>
          </g>
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.27 + size * (i + 1) * 0.92} size={size} role={display} fill={i === 0 ? colours.ink : colours.accent}>
              {line.toUpperCase()}
            </Txt>
          ))}
          {content.variant ? (
            <g>
              <rect x={cx - box.w * 0.38} y={box.y + box.h * 0.27 + size * lines.length * 0.92 + u * 0.03} width={box.w * 0.76} height={u * 0.085} rx={u * 0.042} fill={colours.accent2} />
              <Txt x={cx} y={box.y + box.h * 0.27 + size * lines.length * 0.92 + u * 0.09} size={fitFontSize(content.variant.toUpperCase(), box.w * 0.6, u * 0.05, display)} role={display} fill={colours.accent}>
                {content.variant.toUpperCase()}
              </Txt>
            </g>
          ) : null}
          <Photo ctx={ctx} cx={box.x + box.w * 0.74} cy={box.y + box.h * 0.86} r={Math.min(box.w * 0.28, box.h * 0.16)} shape="bowl" ring="#2A1A10" />
          <Claims ctx={ctx} x={box.x} y={box.y + box.h * 0.7} w={box.w * 0.4} size={u * 0.04} colour={colours.ink} bullet={colours.accent2} />
          <Net ctx={ctx} x={box.x} y={box.y + box.h} size={u * 0.035} colour={colours.ink} anchor="start" />
        </g>
      );
    }
    case "pop": {
      const headline = (content.tagline && content.tagline.length <= 22 ? content.tagline : content.variant && content.variant.length <= 22 ? content.variant : content.name || "Tough choice").toUpperCase();
      const headLines = wrapText(headline, tall ? 9 : 12).slice(0, 3);
      const hs = Math.min(...headLines.map((line) => fitFontSize(line, box.w * 0.84, u * 0.2, display)));
      const nameSize = name(box.w * 0.75, u * 0.11);
      const dots = [[0.12, 0.72], [0.86, 0.6], [0.18, 0.92], [0.9, 0.88], [0.55, 0.95]];
      return (
        <g>
          <ellipse cx={cx} cy={box.y + u * 0.07} rx={box.w * 0.22} ry={u * 0.065} fill={colours.accent} />
          <Logo ctx={ctx} x={cx} y={box.y + u * 0.03} w={box.w * 0.34} h={u * 0.08} colour={colours.ground} />
          <g transform={`rotate(-5 ${cx} ${box.y + box.h * 0.35})`}>
            {headLines.map((line, i) => (
              <Txt key={i} x={cx} y={box.y + u * 0.15 + hs * (i + 1) * 0.95} size={hs} role={display} fill={colours.ink}>
                {line}
              </Txt>
            ))}
          </g>
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.6 + nameSize * (i + 1)} size={nameSize} role={display} fill={colours.accent}>
              {line.toUpperCase()}
            </Txt>
          ))}
          {dots.map(([dx, dy], i) => <ellipse key={i} cx={box.x + box.w * dx} cy={box.y + box.h * dy} rx={u * 0.045} ry={u * 0.03} fill="#5A2E16" transform={`rotate(${i * 37} ${box.x + box.w * dx} ${box.y + box.h * dy})`} />)}
          <Photo ctx={ctx} cx={cx} cy={box.y + box.h * 0.52} r={Math.min(u * 0.12, box.h * 0.07)} shape="cutout" />
          <Txt x={cx} y={box.y + box.h - u * 0.06} size={Math.min(u * 0.04, fitFontSize(content.variant || content.claims.join(" · "), box.w * 0.9, u * 0.04, "sans"))} role="sans" fill={colours.accent}>
            {content.variant || content.claims.slice(0, 2).join(" · ")}
          </Txt>
          <Net ctx={ctx} x={cx} y={box.y + box.h} size={u * 0.032} colour={colours.accent} anchor="middle" />
        </g>
      );
    }
    case "split": {
      const splitY = box.y + box.h * 0.56;
      const wave = `M ${full.x} ${splitY} C ${full.x + full.w * 0.3} ${splitY - u * 0.08}, ${full.x + full.w * 0.6} ${splitY + u * 0.08}, ${full.x + full.w} ${splitY - u * 0.03} L ${full.x + full.w} ${full.y + full.h} L ${full.x} ${full.y + full.h} Z`;
      const size = name(box.w * 0.9, u * 0.2);
      return (
        <g>
          {[0.15, 0.4, 0.7].map((dx, i) => <Leaf key={i} cx={full.x + full.w * dx} cy={box.y + box.h * (0.1 + i * 0.12)} size={u * 0.12} fill={colours.accent2} rotate={i * 50} />)}
          <Logo ctx={ctx} x={cx} y={box.y} w={box.w * 0.5} h={u * 0.1} colour={colours.ink} role="script" />
          {content.tagline ? <Txt x={cx} y={box.y + u * 0.15} size={fitFontSize(content.tagline, box.w * 0.8, u * 0.035, "sans")} role="sans" fill={colours.ink} weight={600}>{content.tagline}</Txt> : null}
          {content.variant ? (
            <g>
              <rect x={cx - box.w * 0.3} y={box.y + box.h * 0.2} width={box.w * 0.6} height={u * 0.08} fill={colours.accent} />
              <Txt x={cx} y={box.y + box.h * 0.2 + u * 0.058} size={fitFontSize(content.variant, box.w * 0.55, u * 0.05, "round")} role="round" fill={colours.accent2} weight={600}>{content.variant}</Txt>
            </g>
          ) : null}
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.3 + size * (i + 1) * 0.95} size={size} role={display} fill={colours.ink} weight={600}>{line.toUpperCase()}</Txt>
          ))}
          <path d={wave} fill={colours.accent} />
          <Photo ctx={ctx} cx={box.x + box.w * 0.3} cy={box.y + box.h * 0.8} r={Math.min(box.w * 0.3, box.h * 0.17)} shape="bowl" ring="#6B4A2B" />
          {content.claims.slice(0, 4).map((claim, i) => (
            <g key={i}>
              <rect x={box.x + box.w * 0.6} y={splitY + u * 0.06 + i * u * 0.075} width={box.w * 0.4} height={u * 0.06} rx={u * 0.03} fill={colours.accent2} />
              <circle cx={box.x + box.w * 0.6 + u * 0.03} cy={splitY + u * 0.09 + i * u * 0.075} r={u * 0.022} fill="#FFFFFF" />
              <Txt x={box.x + box.w * 0.6 + u * 0.06} y={splitY + u * 0.1 + i * u * 0.075} size={fitFontSize(claim.toUpperCase(), box.w * 0.4 - u * 0.08, u * 0.026, "sans")} role="sans" fill="#FFFFFF" anchor="start">{claim.toUpperCase()}</Txt>
            </g>
          ))}
          <Net ctx={ctx} x={box.x + box.w} y={box.y + box.h} size={u * 0.03} colour={readableOn(colours.accent)} />
        </g>
      );
    }
    case "kraft": {
      const size = name(box.w * 0.85, u * 0.16, "serif");
      const r = u * 0.16;
      const sy = box.y + r + u * 0.02;
      return (
        <g>
          <circle cx={cx} cy={sy} r={r} fill="none" stroke={colours.ink} strokeWidth={u * 0.01} />
          <circle cx={cx} cy={sy} r={r * 0.82} fill="none" stroke={colours.ink} strokeWidth={u * 0.004} />
          <path id={`${uid}-arc`} d={`M ${cx - r * 0.9} ${sy} A ${r * 0.9} ${r * 0.9} 0 0 1 ${cx + r * 0.9} ${sy}`} fill="none" />
          <text fontSize={u * 0.032} fontFamily={FONT.sans} fontWeight={700} fill={colours.ink} letterSpacing={u * 0.006}>
            <textPath href={`#${uid}-arc`} startOffset="50%" textAnchor="middle">{(content.brand || "Your brand").toUpperCase()}</textPath>
          </text>
          {design.showLogo && design.logoUrl ? <image href={design.logoUrl} x={cx - r * 0.55} y={sy - r * 0.4} width={r * 1.1} height={r * 0.9} preserveAspectRatio="xMidYMid meet" /> : <Txt x={cx} y={sy + r * 0.3} size={r * 0.8} role="script" fill={colours.ink}>{(content.brand || "B").slice(0, 1)}</Txt>}
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.48 + size * i * 1.05} size={size} role="serif" fill={colours.ink} weight={700}>{line}</Txt>
          ))}
          {content.variant ? <Txt x={cx} y={box.y + box.h * 0.48 + size * lines.length * 1.05 + u * 0.03} size={fitFontSize(content.variant, box.w * 0.8, u * 0.08, "script")} role="script" fill={colours.accent2} weight={700}>{content.variant}</Txt> : null}
          <line x1={box.x + box.w * 0.2} y1={box.y + box.h * 0.48 + size * lines.length * 1.05 + u * 0.08} x2={box.x + box.w * 0.8} y2={box.y + box.h * 0.48 + size * lines.length * 1.05 + u * 0.08} stroke={colours.ink} strokeWidth={u * 0.004} strokeDasharray={`${u * 0.02} ${u * 0.012}`} />
          {content.claims.slice(0, 3).map((claim, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.48 + size * lines.length * 1.05 + u * 0.16 + i * u * 0.06} size={fitFontSize(`✓ ${claim}`, box.w * 0.85, u * 0.055, "script")} role="script" fill={colours.ink} weight={700}>{`✓ ${claim}`}</Txt>
          ))}
          <Net ctx={ctx} x={cx} y={box.y + box.h} size={u * 0.032} colour={colours.ink} anchor="middle" />
        </g>
      );
    }
    case "minimal": {
      const size = name(box.w * 0.8, u * 0.12, "serif");
      return (
        <g>
          <Logo ctx={ctx} x={cx} y={box.y + box.h * 0.08} w={box.w * 0.5} h={u * 0.06} colour={colours.ink} />
          <line x1={cx - box.w * 0.08} y1={box.y + box.h * 0.2} x2={cx + box.w * 0.08} y2={box.y + box.h * 0.2} stroke={colours.accent} strokeWidth={u * 0.004} />
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.42 + size * i * 1.1} size={size} role="serif" fill={colours.ink} weight={400}>{line}</Txt>
          ))}
          {content.variant ? <Txt x={cx} y={box.y + box.h * 0.42 + size * lines.length * 1.1 + u * 0.02} size={fitFontSize(content.variant, box.w * 0.7, u * 0.045, "serif")} role="serif" fill={colours.accent} italic weight={400}>{content.variant}</Txt> : null}
          <Photo ctx={ctx} cx={cx} cy={box.y + box.h * 0.7} r={Math.min(box.w * 0.24, box.h * 0.12)} shape="cutout" />
          <Txt x={cx} y={box.y + box.h * 0.88} size={Math.min(u * 0.026, fitFontSize(content.claims.join("  ·  "), box.w * 0.9, u * 0.026, "sans"))} role="sans" fill={colours.ink} weight={500} spacing={u * 0.004}>{content.claims.join("  ·  ").toUpperCase()}</Txt>
          <Net ctx={ctx} x={cx} y={box.y + box.h} size={u * 0.028} colour={colours.ink} anchor="middle" />
        </g>
      );
    }
    case "botanical": {
      const r = Math.min(box.w * 0.32, box.h * (tall ? 0.2 : 0.15));
      const acy = box.y + box.h * (tall ? 0.4 : 0.36);
      const size = name(box.w * 0.85, u * 0.11, "serif");
      return (
        <g>
          <Logo ctx={ctx} x={cx} y={box.y} w={box.w * 0.5} h={u * 0.08} colour={colours.accent} role="serif" />
          <path d={`M ${cx - r * 1.1} ${acy + r * 1.3} L ${cx - r * 1.1} ${acy - r * 0.25} A ${r * 1.1} ${r * 1.1} 0 0 1 ${cx + r * 1.1} ${acy - r * 0.25} L ${cx + r * 1.1} ${acy + r * 1.3}`} fill="none" stroke={colours.accent} strokeWidth={u * 0.005} />
          {design.image ? <Photo ctx={ctx} cx={cx} cy={acy} r={r} shape="arch" /> : <path d={`M ${cx - r} ${acy + r * 1.25} L ${cx - r} ${acy - r * 0.25} A ${r} ${r} 0 0 1 ${cx + r} ${acy - r * 0.25} L ${cx + r} ${acy + r * 1.25} Z`} fill={colours.accent2} />}
          {!design.image ? [[-0.3, 0.3, -30], [0.3, 0.2, 30], [0, -0.1, 0]].map(([dx, dy, rot], i) => <Leaf key={i} cx={cx + dx * r} cy={acy + dy * r} size={r * 0.9} fill={colours.accent} rotate={rot} />) : null}
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={acy + r * 1.3 + u * 0.03 + size * (i + 1)} size={size} role="serif" fill={colours.ink} weight={500}>{line}</Txt>
          ))}
          {content.variant ? <Txt x={cx} y={acy + r * 1.3 + u * 0.06 + size * (lines.length + 0.6)} size={fitFontSize(content.variant, box.w * 0.8, u * 0.04, "serif")} role="serif" fill={colours.accent} italic weight={400}>{content.variant}</Txt> : null}
          <Net ctx={ctx} x={cx} y={box.y + box.h} size={u * 0.03} colour={colours.accent} anchor="middle" />
        </g>
      );
    }
    case "ankara": {
      const bandH = Math.min(u * 0.14, box.h * 0.12);
      const size = name(box.w * 0.9, u * 0.17);
      return (
        <g>
          <Pattern ctx={ctx} x={full.x} y={full.y} w={full.w} h={box.y - full.y + bandH} />
          <Pattern ctx={ctx} x={full.x} y={box.y + box.h - bandH} w={full.w} h={full.y + full.h - (box.y + box.h - bandH)} />
          <Logo ctx={ctx} x={cx} y={box.y + bandH + u * 0.03} w={box.w * 0.5} h={u * 0.08} colour={colours.ink} />
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + bandH + u * 0.14 + size * (i + 1) * 0.95} size={size} role={display} fill={i === 0 ? colours.ink : colours.accent}>{line.toUpperCase()}</Txt>
          ))}
          {content.variant ? <Txt x={cx} y={box.y + bandH + u * 0.18 + size * lines.length * 0.95 + u * 0.03} size={fitFontSize(content.variant.toUpperCase(), box.w * 0.8, u * 0.045, "sans")} role="sans" fill={colours.accent2}>{content.variant.toUpperCase()}</Txt> : null}
          <Photo ctx={ctx} cx={cx} cy={box.y + box.h * 0.66} r={Math.min(box.w * 0.24, box.h * 0.14)} shape="bowl" ring={colours.accent2} />
          <Txt x={cx} y={box.y + box.h - bandH - u * 0.03} size={Math.min(u * 0.03, fitFontSize(content.claims.join(" • "), box.w * 0.95, u * 0.03, "sans"))} role="sans" fill={colours.ink}>{content.claims.join(" • ")}</Txt>
          {content.netContent ? <g><rect x={box.x + box.w - u * 0.3} y={box.y + box.h - bandH - u * 0.17} width={u * 0.3} height={u * 0.07} rx={u * 0.035} fill={colours.ink} /><Txt x={box.x + box.w - u * 0.15} y={box.y + box.h - bandH - u * 0.12} size={fitFontSize(content.netContent, u * 0.27, u * 0.03, "sans")} role="sans" fill={colours.ground}>{content.netContent}</Txt></g> : null}
        </g>
      );
    }
    case "badge": {
      const r = Math.min(box.w, box.h * 0.75) * 0.42;
      const ecy = box.y + box.h * 0.42;
      const size = name(r * 1.3, r * 0.42, display);
      const rays = 28;
      return (
        <g>
          {Array.from({ length: rays }, (_, i) => {
            const a1 = (i / rays) * Math.PI * 2;
            const a2 = a1 + Math.PI / rays;
            const far = u * 2;
            return i % 2 ? null : <path key={i} d={`M ${cx} ${ecy} L ${cx + Math.cos(a1) * far} ${ecy + Math.sin(a1) * far} L ${cx + Math.cos(a2) * far} ${ecy + Math.sin(a2) * far} Z`} fill={colours.accent2} opacity={0.35} />;
          })}
          <circle cx={cx} cy={ecy} r={r} fill={colours.accent} />
          <circle cx={cx} cy={ecy} r={r * 0.86} fill="none" stroke={colours.ground} strokeWidth={r * 0.025} />
          <path id={`${uid}-ring`} d={`M ${cx - r * 0.74} ${ecy} A ${r * 0.74} ${r * 0.74} 0 0 1 ${cx + r * 0.74} ${ecy}`} fill="none" />
          <text fontSize={r * 0.13} fontFamily={FONT.sans} fontWeight={800} fill={colours.ground} letterSpacing={r * 0.02}>
            <textPath href={`#${uid}-ring`} startOffset="50%" textAnchor="middle">{(content.brand || "Your brand").toUpperCase()}</textPath>
          </text>
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={ecy - r * 0.08 + size * i * 0.95} size={size} role={display} fill={colours.ground}>{line.toUpperCase()}</Txt>
          ))}
          {content.variant ? (
            <g>
              <path d={`M ${cx - r * 1.15} ${ecy + r * 0.42} L ${cx + r * 1.15} ${ecy + r * 0.42} L ${cx + r * 1.05} ${ecy + r * 0.55} L ${cx + r * 1.15} ${ecy + r * 0.68} L ${cx - r * 1.15} ${ecy + r * 0.68} L ${cx - r * 1.05} ${ecy + r * 0.55} Z`} fill={colours.accent2} />
              <Txt x={cx} y={ecy + r * 0.6} size={fitFontSize(content.variant.toUpperCase(), r * 1.9, r * 0.17, "sans")} role="sans" fill={colours.ink}>{content.variant.toUpperCase()}</Txt>
            </g>
          ) : null}
          {content.tagline ? <Txt x={cx} y={box.y + box.h * 0.87} size={fitFontSize(content.tagline, box.w * 0.9, u * 0.05, "serif")} role="serif" fill={colours.ink} italic>{content.tagline}</Txt> : null}
          <Net ctx={ctx} x={cx} y={box.y + box.h} size={u * 0.032} colour={colours.ink} anchor="middle" />
        </g>
      );
    }
    case "clinical": {
      const blockH = box.h * 0.4;
      const size = name(box.w * 0.88, u * 0.13, "sans");
      return (
        <g>
          <rect x={full.x} y={full.y} width={full.w} height={box.y - full.y + blockH} fill={colours.accent} />
          <Logo ctx={ctx} x={box.x} y={box.y} w={box.w * 0.45} h={u * 0.07} colour="#FFFFFF" anchor="start" />
          {lines.map((line, i) => (
            <Txt key={i} x={box.x} y={box.y + blockH * 0.45 + size * i * 1.02} size={size} role="sans" fill="#FFFFFF" anchor="start" weight={800}>{line}</Txt>
          ))}
          {content.netContent ? <Txt x={box.x} y={box.y + blockH - u * 0.03} size={fitFontSize(content.netContent.toUpperCase(), box.w * 0.6, u * 0.045, "sans")} role="sans" fill="#FFFFFF" anchor="start" weight={500} spacing={u * 0.004}>{content.netContent.toUpperCase()}</Txt> : null}
          {content.variant ? <Txt x={box.x} y={box.y + blockH + u * 0.09} size={fitFontSize(content.variant, box.w * 0.9, u * 0.05, "sans")} role="sans" fill={colours.accent} anchor="start" weight={800}>{content.variant}</Txt> : null}
          {content.claims.slice(0, 4).map((claim, i) => (
            <g key={i}>
              <rect x={box.x} y={box.y + blockH + u * 0.15 + i * u * 0.07} width={u * 0.035} height={u * 0.035} fill={colours.accent} />
              <Txt x={box.x + u * 0.06} y={box.y + blockH + u * 0.18 + i * u * 0.07} size={fitFontSize(claim, box.w * 0.85, u * 0.035, "sans")} role="sans" fill={colours.ink} anchor="start" weight={600}>{claim}</Txt>
            </g>
          ))}
          <Photo ctx={ctx} cx={box.x + box.w * 0.78} cy={box.y + box.h * 0.8} r={Math.min(box.w * 0.2, box.h * 0.12)} shape="cutout" />
          <rect x={full.x} y={box.y + box.h - u * 0.012} width={full.w} height={full.y + full.h - (box.y + box.h) + u * 0.012} fill={colours.accent2} />
        </g>
      );
    }
    case "playful": {
      const size = name(box.w * 0.85, u * 0.2, "round");
      const blob = (bx: number, by: number, r: number, fill: string) => (
        <path d={`M ${bx - r} ${by} C ${bx - r} ${by - r * 1.1}, ${bx + r * 0.9} ${by - r * 1.2}, ${bx + r} ${by - r * 0.1} C ${bx + r * 1.1} ${by + r}, ${bx - r * 0.3} ${by + r * 1.2}, ${bx - r} ${by} Z`} fill={fill} />
      );
      return (
        <g>
          {blob(box.x + box.w * 0.1, box.y + box.h * 0.12, u * 0.22, colours.accent2)}
          {blob(box.x + box.w * 0.92, box.y + box.h * 0.55, u * 0.25, colours.accent)}
          {blob(box.x + box.w * 0.2, box.y + box.h * 0.92, u * 0.2, colours.accent2)}
          <Logo ctx={ctx} x={cx} y={box.y + box.h * 0.03} w={box.w * 0.5} h={u * 0.09} colour={colours.ink} role="round" />
          <g transform={`rotate(-4 ${cx} ${box.y + box.h * 0.3})`}>
            {lines.map((line, i) => (
              <Txt key={i} x={cx} y={box.y + box.h * 0.17 + size * (i + 1) * 0.95} size={size} role="round" fill={colours.ink} weight={600}>{line}</Txt>
            ))}
          </g>
          {content.variant ? (
            <g>
              <rect x={cx - box.w * 0.3} y={box.y + box.h * 0.17 + size * lines.length * 0.95 + u * 0.03} width={box.w * 0.6} height={u * 0.08} rx={u * 0.04} fill={colours.accent} />
              <Txt x={cx} y={box.y + box.h * 0.17 + size * lines.length * 0.95 + u * 0.087} size={fitFontSize(content.variant, box.w * 0.55, u * 0.05, "round")} role="round" fill="#FFFFFF" weight={600}>{content.variant}</Txt>
            </g>
          ) : null}
          <Photo ctx={ctx} cx={cx} cy={box.y + box.h * 0.7} r={Math.min(box.w * 0.25, box.h * 0.15)} shape="cutout" />
          {content.claims.slice(0, 2).map((claim, i) => {
            const bx = i === 0 ? box.x + box.w * 0.16 : box.x + box.w * 0.84;
            const by = box.y + box.h * (i === 0 ? 0.62 : 0.84);
            return (
              <g key={i}>
                <circle cx={bx} cy={by} r={u * 0.1} fill="#FFFFFF" />
                {wrapText(claim, 14).slice(0, 2).map((line, j, all) => <Txt key={j} x={bx} y={by + u * 0.015 + (j - (all.length - 1) / 2) * u * 0.045} size={Math.min(...all.map((l) => fitFontSize(l, u * 0.17, u * 0.04, "round")))} role="round" fill={colours.ink} weight={600}>{line}</Txt>)}
              </g>
            );
          })}
          <Net ctx={ctx} x={box.x + box.w} y={box.y + box.h} size={u * 0.032} colour={colours.ink} role="round" />
        </g>
      );
    }
    case "luxe": {
      const size = name(box.w * 0.8, u * 0.1, "serif");
      const inset = u * 0.04;
      const initials = (content.brand || "B").split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
      return (
        <g>
          <rect x={box.x - inset / 2} y={box.y - inset / 2} width={box.w + inset} height={box.h + inset} fill="none" stroke={colours.accent} strokeWidth={u * 0.004} />
          <rect x={box.x + inset / 2} y={box.y + inset / 2} width={box.w - inset} height={box.h - inset} fill="none" stroke={colours.accent} strokeWidth={u * 0.002} />
          <circle cx={cx} cy={box.y + box.h * 0.22} r={u * 0.1} fill="none" stroke={colours.accent} strokeWidth={u * 0.004} />
          {design.showLogo && design.logoUrl ? <image href={design.logoUrl} x={cx - u * 0.07} y={box.y + box.h * 0.22 - u * 0.07} width={u * 0.14} height={u * 0.14} preserveAspectRatio="xMidYMid meet" /> : <Txt x={cx} y={box.y + box.h * 0.22 + u * 0.035} size={u * 0.1} role="serif" fill={colours.accent} weight={400}>{initials}</Txt>}
          <Txt x={cx} y={box.y + box.h * 0.4} size={fitFontSize((content.brand || "Your brand").toUpperCase(), box.w * 0.7, u * 0.035, "serif")} role="serif" fill={colours.ink} weight={400} spacing={u * 0.012}>{(content.brand || "Your brand").toUpperCase()}</Txt>
          {lines.map((line, i) => (
            <Txt key={i} x={cx} y={box.y + box.h * 0.56 + size * i * 1.1} size={size} role="serif" fill={colours.accent} weight={400}>{line}</Txt>
          ))}
          <line x1={cx - box.w * 0.12} y1={box.y + box.h * 0.56 + size * lines.length * 1.1} x2={cx + box.w * 0.12} y2={box.y + box.h * 0.56 + size * lines.length * 1.1} stroke={colours.accent} strokeWidth={u * 0.003} />
          {content.variant ? <Txt x={cx} y={box.y + box.h * 0.56 + size * lines.length * 1.1 + u * 0.06} size={fitFontSize(content.variant, box.w * 0.7, u * 0.04, "serif")} role="serif" fill={colours.ink} italic weight={400}>{content.variant}</Txt> : null}
          <Net ctx={ctx} x={cx} y={box.y + box.h - u * 0.05} size={u * 0.028} colour={colours.accent} anchor="middle" role="serif" />
        </g>
      );
    }
  }
}

/** Ankara-style geometric band: triangles, diamonds and dots in the accent colours. */
function Pattern({ ctx, x, y, w, h }: { ctx: Ctx; x: number; y: number; w: number; h: number }) {
  const { accent, accent2, ink, ground } = ctx.design.colours;
  const cell = Math.max(4, h);
  const count = Math.ceil(w / cell) + 1;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={accent} />
      {Array.from({ length: count }, (_, i) => {
        const cx = x + i * cell;
        return (
          <g key={i}>
            <path d={`M ${cx} ${y + h} L ${cx + cell / 2} ${y} L ${cx + cell} ${y + h} Z`} fill={i % 2 ? accent2 : ink} />
            <path d={`M ${cx + cell / 2} ${y + h * 0.3} L ${cx + cell * 0.7} ${y + h * 0.6} L ${cx + cell / 2} ${y + h * 0.9} L ${cx + cell * 0.3} ${y + h * 0.6} Z`} fill={ground} />
            <circle cx={cx} cy={y + h * 0.2} r={cell * 0.08} fill={ground} />
          </g>
        );
      })}
    </g>
  );
}

// ─── Back, sides and flaps ───────────────────────────────────────────────────

/** Where the barcode and QR code sit on an info panel, in mm (the PDF redraws the barcode as vectors there). */
export function codeSpots(design: PackDesign): CodeSpot[] {
  const layout = packLayout(design.format, design.size);
  const hasInfo2 = layout.panels.some((panel) => panel.role === "info2");
  const panel = layout.panels.find((p) => p.role === (hasInfo2 ? "info2" : "info"));
  if (!panel || !design.content.barcode) return [];
  const spots = codeArea(contentBox(panel, layout), hasInfo2);
  return spots.barcode ? [{ ...spots.barcode, value: design.content.barcode }] : [];
}

function codeArea(box: Box, narrow: boolean) {
  const stripH = Math.min(40, Math.max(16, box.h * (narrow ? 0.34 : 0.24)));
  const top = box.y + box.h - stripH;
  const bw = Math.min(narrow ? box.w : box.w * 0.42, 38);
  const bh = Math.min(stripH * 0.62, bw * 0.55);
  const barcode = { x: box.x + box.w - bw, y: box.y + box.h - bh, w: bw, h: bh };
  const qr = Math.min(stripH * 0.62, narrow ? box.w * 0.4 : 20);
  return { top, stripH, barcode, qr: { x: box.x, y: box.y + box.h - qr, w: qr, h: qr } };
}

function Info({ ctx, box, part }: { ctx: Ctx; box: Box; part: "words" | "codes" | "all" }) {
  const { design } = ctx;
  const { content, colours } = design;
  const ink = colours.ink;
  const body = PACK_STYLE_INFO[design.style].body;
  const showWords = part !== "codes";
  const showCodes = part !== "words";
  const area = codeArea(box, part === "codes");
  const textBottom = showCodes ? area.top - 2 : box.y + box.h;
  const header = showWords ? Math.min(7, box.w * 0.08) : 0;
  const nutrition = showCodes && content.nutrition.length && ["food", "drinks", "pet"].includes(design.productType) ? content.nutrition : [];
  const nutritionH = nutrition.length ? Math.min((nutrition.length + 1.6) * Math.min(5, Math.max(3.2, box.w / 30)), (textBottom - box.y) * (part === "codes" ? 0.9 : 0.4)) : 0;
  const wordsTop = box.y + (header ? header * 1.6 : 0);
  const wordsH = Math.max(0, textBottom - wordsTop - nutritionH - (nutritionH ? 2 : 0));
  const words = showWords ? layoutInfo(infoBlocks(content, design.productType), box.w, wordsH, body, Math.min(4.2, Math.max(2.4, box.w / 36))) : null;
  const regLabel = PRODUCT_TYPE_INFO[design.productType].regLabel || "Reg. No.";
  const legal = [
    content.regNumber ? `${regLabel} ${content.regNumber}` : "",
    content.manufacturer ? `Made by ${content.manufacturer}` : "",
    content.madeIn,
    [content.website, content.phone].filter(Boolean).join(" · "),
  ].filter(Boolean);

  return (
    <g fill={ink}>
      {showWords ? (
        <Txt x={box.x} y={box.y + header} size={fitFontSize(`${content.brand} ${content.name}`.trim().toUpperCase() || "PRODUCT", box.w * 0.8, header, "sans")} role="sans" fill={ink} anchor="start" weight={800}>
          {`${content.brand} ${content.name}`.trim().toUpperCase()}
        </Txt>
      ) : null}
      {words?.lines.map((line, i) => (
        <text key={i} x={box.x} y={wordsTop + line.y} fontSize={line.heading ? words.size * 0.92 : words.size} fontFamily={FONT[body]} fontWeight={line.bold ? 800 : 400} letterSpacing={line.heading ? words.size * 0.06 : undefined} fill={ink}>
          {line.text}
        </text>
      ))}
      {nutrition.length ? <NutritionTable ctx={ctx} x={box.x} y={textBottom - nutritionH} w={box.w} h={nutritionH} /> : null}
      {showCodes ? (
        <g>
          {content.qrUrl ? <Qr url={content.qrUrl} {...area.qr} fg={ink} /> : null}
          {content.barcode ? <Barcode value={content.barcode} {...area.barcode} /> : null}
          <BatchAndLegal ctx={ctx} x={content.qrUrl ? area.qr.x + area.qr.w + 2 : box.x} y={area.top} w={(content.barcode ? area.barcode.x : box.x + box.w) - (content.qrUrl ? area.qr.x + area.qr.w + 2 : box.x) - 2} h={area.stripH} legal={legal} narrow={part === "codes"} />
        </g>
      ) : null}
    </g>
  );
}

function NutritionTable({ ctx, x, y, w, h }: { ctx: Ctx; x: number; y: number; w: number; h: number }) {
  const { content, colours } = ctx.design;
  const rows = content.nutrition;
  const rowH = h / (rows.length + 1.6);
  const size = Math.min(rowH * 0.62, 3.2);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={colours.ink} strokeWidth={0.25} />
      <Txt x={x + 1} y={y + rowH * 0.8} size={size * 1.1} role="sans" fill={colours.ink} anchor="start" weight={800}>
        {`NUTRITION${content.servingSize ? ` · per ${content.servingSize}` : ""}`}
      </Txt>
      <line x1={x} y1={y + rowH * 1.2} x2={x + w} y2={y + rowH * 1.2} stroke={colours.ink} strokeWidth={0.5} />
      {rows.map((row, i) => (
        <g key={i}>
          <Txt x={x + 1} y={y + rowH * (1.2 + i + 0.75)} size={size} role="sans" fill={colours.ink} anchor="start" weight={500}>{row.label}</Txt>
          <Txt x={x + w - 1} y={y + rowH * (1.2 + i + 0.75)} size={size} role="sans" fill={colours.ink} anchor="end" weight={700}>{row.value}</Txt>
          {i < rows.length - 1 ? <line x1={x} y1={y + rowH * (2.2 + i)} x2={x + w} y2={y + rowH * (2.2 + i)} stroke={colours.ink} strokeWidth={0.12} /> : null}
        </g>
      ))}
    </g>
  );
}

function BatchAndLegal({ ctx, x, y, w, h, legal, narrow }: { ctx: Ctx; x: number; y: number; w: number; h: number; legal: string[]; narrow: boolean }) {
  const { content, colours } = ctx.design;
  if (w < 8) return null;
  const size = Math.min(3, h / 9);
  const batch = [content.batch ? `Batch: ${content.batch}` : "Batch:", content.mfgDate ? `Mfd: ${content.mfgDate}` : "Mfd:", content.expiry ? `Best before: ${content.expiry}` : "Best before:"];
  const lines = legal.flatMap((line) => wrapText(line, w / (size * 0.55))).slice(0, narrow ? 3 : 4);
  const boxH = size * 1.4 * 3 + 1.4;
  return (
    <g>
      <rect x={x} y={y} width={w} height={boxH} fill="#FFFFFF" fillOpacity={0.9} stroke={colours.ink} strokeWidth={0.2} />
      {batch.map((line, i) => (
        <Txt key={i} x={x + 0.8} y={y + 0.4 + size * 1.4 * (i + 1)} size={size} role="sans" fill="#111111" anchor="start" weight={600}>{line}</Txt>
      ))}
      {lines.map((line, i) => (
        <Txt key={i} x={x} y={y + boxH + 0.6 + size * 1.3 * (i + 1)} size={size} role="sans" fill={colours.ink} anchor="start" weight={500}>{line}</Txt>
      ))}
    </g>
  );
}

function Barcode({ value, x, y, w, h }: { value: string; x: number; y: number; w: number; h: number }) {
  let bars: ReturnType<typeof barcodeBars>;
  try {
    bars = barcodeBars(value);
  } catch {
    return null;
  }
  const textH = Math.min(3, h * 0.22);
  const unit = w / bars.total;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#FFFFFF" />
      <g fill="#000000" shapeRendering="crispEdges">
        {bars.bars.map(([bx, bw], i) => <rect key={i} x={x + bx * unit} y={y} width={bw * unit} height={h - textH} />)}
      </g>
      <text x={x + w / 2} y={y + h - textH * 0.15} fontSize={textH * 0.85} fontFamily="monospace" textAnchor="middle" fill="#000000">{bars.label}</text>
    </g>
  );
}

function Qr({ url, x, y, w, fg }: { url: string; x: number; y: number; w: number; h: number; fg: string }) {
  let modules: { size: number; data: Uint8Array | boolean[] };
  try {
    modules = QRCode.create(url, { errorCorrectionLevel: "M" }).modules as unknown as { size: number; data: Uint8Array };
  } catch {
    return null;
  }
  const quiet = 1;
  const cell = w / (modules.size + quiet * 2);
  const dark = luminanceDark(fg) ? fg : "#000000";
  const rects: ReactNode[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.data[row * modules.size + col]) rects.push(<rect key={`${row}-${col}`} x={x + (col + quiet) * cell} y={y + (row + quiet) * cell} width={cell * 1.02} height={cell * 1.02} />);
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={w} fill="#FFFFFF" />
      <g fill={dark} shapeRendering="crispEdges">{rects}</g>
    </g>
  );
}

function luminanceDark(hex: string) {
  return readableOn(hex) === "#FFFFFF";
}

function Side({ ctx, box }: { ctx: Ctx; box: Box }) {
  const { content, colours } = ctx.design;
  const display = PACK_STYLE_INFO[ctx.design.style].display;
  const label = `${content.brand} ${content.name}`.trim().toUpperCase() || "YOUR BRAND";
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const size = fitFontSize(label, box.h * 0.85, box.w * 0.45, display);
  return (
    <g>
      <Txt x={cx} y={cy + size * 0.35} size={size} role={display} fill={colours.ink} rotate={-90}>{label}</Txt>
      {content.claims[0] ? <Txt x={cx + size * 0.9} y={cy} size={Math.min(size * 0.4, fitFontSize(content.claims[0], box.h * 0.7, box.w * 0.18, "sans"))} role="sans" fill={colours.accent} rotate={-90}>{content.claims[0]}</Txt> : null}
    </g>
  );
}

function Plain({ ctx, box }: { ctx: Ctx; box: Box }) {
  const { colours, content } = ctx.design;
  if (box.h < 8 || box.w < 8) return null;
  return (
    <g>
      <Logo ctx={ctx} x={box.x + box.w / 2} y={box.y + box.h * 0.25} w={box.w * 0.6} h={box.h * 0.35} colour={colours.ink} />
      {content.tagline ? <Txt x={box.x + box.w / 2} y={box.y + box.h * 0.85} size={fitFontSize(content.tagline, box.w * 0.9, box.h * 0.16, "sans")} role="sans" fill={colours.ink} weight={500}>{content.tagline}</Txt> : null}
    </g>
  );
}

// ─── Guides (screen only) ────────────────────────────────────────────────────

function Guides({ layout }: { layout: PackLayout }) {
  const stroke = 0.3;
  return (
    <g pointerEvents="none">
      {layout.seals.map((seal, i) => <rect key={`s${i}`} x={seal.x} y={seal.y} width={seal.w} height={seal.h} fill="#E86A4F" opacity={0.16} />)}
      {layout.panels.map((panel) => {
        const box = contentBox(panel, layout);
        return <rect key={panel.id} x={box.x} y={box.y} width={box.w} height={box.h} fill="none" stroke="#2E7E78" strokeWidth={stroke * 0.7} strokeDasharray="1.5 1" />;
      })}
      <rect x={-BLEED_MM} y={-BLEED_MM} width={layout.width + BLEED_MM * 2} height={layout.height + BLEED_MM * 2} fill="none" stroke="#E86A4F" strokeWidth={stroke * 0.6} strokeDasharray="0.8 0.8" />
      {layout.cuts.map((outline, i) => <polygon key={`c${i}`} points={outline.map((p) => p.join(",")).join(" ")} fill="none" stroke="#E5007E" strokeWidth={stroke} />)}
      {layout.circles.map((c, i) => <circle key={`r${i}`} cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="#E5007E" strokeWidth={stroke} />)}
      {layout.folds.map(([a, b], i) => <line key={`f${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#00A0E3" strokeWidth={stroke} strokeDasharray="2 1.2" />)}
    </g>
  );
}
