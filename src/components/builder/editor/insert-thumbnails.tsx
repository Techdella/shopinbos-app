// Small wireframe pictures of every section, ready-made block, column layout and element the builder can insert,
// so sellers see the shape of a section before adding it (Insert panel, canvas "+" inserter, page layers list).
// Drawn in currentColor with opacity steps, so they follow the colour of the card they sit in.
// Every kind in INSERT_CATALOG (editor-logic.ts), every layout preset and every element has its own picture here;
// tests/behaviour.test.mjs checks the keys.

import type React from "react";
import { COLUMN_PRESETS, columnPreset } from "@/components/storefront/boutique/blocks/layout-logic";

const W = 80;
const H = 50;

// ─── Primitives (viewBox 80 × 50) ────────────────────────────────────────────

/** Filled box. */
function B({ x, y, w, h, o = 0.16, r = 2 }: { x: number; y: number; w: number; h: number; o?: number; r?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill="currentColor" opacity={o} />;
}
/** A line of text. */
function T({ x, y, w, o = 0.45, h = 2.6 }: { x: number; y: number; w: number; o?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="currentColor" opacity={o} />;
}
/** A button. */
function P({ x, y, w = 14, o = 0.85, h = 5 }: { x: number; y: number; w?: number; o?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="currentColor" opacity={o} />;
}
/** An outlined button. */
function PO({ x, y, w = 14, h = 5 }: { x: number; y: number; w?: number; h?: number }) {
  return <rect x={x + 0.4} y={y + 0.4} width={w - 0.8} height={h - 0.8} rx={(h - 0.8) / 2} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.7} />;
}
function C({ cx, cy, r, o = 0.3 }: { cx: number; cy: number; r: number; o?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="currentColor" opacity={o} />;
}
/** A picture: box with a small hill and sun. */
function Img({ x, y, w, h, r = 2 }: { x: number; y: number; w: number; h: number; r?: number }) {
  const s = Math.min(w, h);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} fill="currentColor" opacity={0.18} />
      <path d={`M${x + w * 0.12} ${y + h * 0.82} L${x + w * 0.4} ${y + h * 0.5} L${x + w * 0.58} ${y + h * 0.68} L${x + w * 0.7} ${y + h * 0.58} L${x + w * 0.88} ${y + h * 0.82} Z`} fill="currentColor" opacity={0.32} />
      <circle cx={x + w * 0.72} cy={y + h * 0.3} r={Math.max(1, s * 0.09)} fill="currentColor" opacity={0.32} />
    </g>
  );
}
/** A product card: picture and two lines. */
function Card({ x, y, w, h = 22 }: { x: number; y: number; w: number; h?: number }) {
  return (
    <g>
      <Img x={x} y={y} w={w} h={h - 7} />
      <T x={x} y={y + h - 5} w={w * 0.8} />
      <T x={x} y={y + h - 1.6} w={w * 0.45} o={0.7} h={2} />
    </g>
  );
}
function Chevron({ x, y, dir = "down" }: { x: number; y: number; dir?: "down" | "left" | "right" }) {
  const d = dir === "down" ? `M${x - 2} ${y - 1} L${x} ${y + 1} L${x + 2} ${y - 1}` : dir === "left" ? `M${x + 1} ${y - 2} L${x - 1} ${y} L${x + 1} ${y + 2}` : `M${x - 1} ${y - 2} L${x + 1} ${y} L${x - 1} ${y + 2}`;
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />;
}
function Arrow({ cx, cy, dir }: { cx: number; cy: number; dir: "left" | "right" }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={3.2} fill="currentColor" opacity={0.85} />
      <path d={dir === "left" ? `M${cx + 0.6} ${cy - 1.3} L${cx - 0.7} ${cy} L${cx + 0.6} ${cy + 1.3}` : `M${cx - 0.6} ${cy - 1.3} L${cx + 0.7} ${cy} L${cx - 0.6} ${cy + 1.3}`} fill="none" stroke="#fff" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
function Stars({ x, y, n = 5 }: { x: number; y: number; n?: number }) {
  return <g>{Array.from({ length: n }, (_, i) => <path key={i} d={`M${x + i * 3.6 + 1.4} ${y} l0.45 1 1.05 0.1 -0.8 0.7 0.25 1.05 -0.95 -0.55 -0.95 0.55 0.25 -1.05 -0.8 -0.7 1.05 -0.1z`} fill="currentColor" opacity={0.8} />)}</g>;
}
function Check({ x, y, o = 0.85 }: { x: number; y: number; o?: number }) {
  return <path d={`M${x} ${y} l1.2 1.2 l2.3 -2.4`} fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" opacity={o} />;
}
function Play({ cx, cy, r = 5 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="currentColor" opacity={0.85} />
      <path d={`M${cx - r * 0.3} ${cy - r * 0.45} L${cx + r * 0.5} ${cy} L${cx - r * 0.3} ${cy + r * 0.45} Z`} fill="#fff" />
    </g>
  );
}
function Heading({ x, y, w, center = false }: { x: number; y: number; w: number; center?: boolean }) {
  return <T x={center ? (W - w) / 2 : x} y={y} w={w} o={0.75} h={3.4} />;
}
/** Dashed frame of a column or grid cell. */
function Cell({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x + 0.4} y={y + 0.4} width={w - 0.8} height={h - 0.8} rx={2} fill="currentColor" opacity={0.06} />
      <rect x={x + 0.4} y={y + 0.4} width={w - 0.8} height={h - 0.8} rx={2} fill="none" stroke="currentColor" strokeWidth={0.7} strokeDasharray="2 1.5" opacity={0.55} />
    </g>
  );
}

// ─── Sections and blocks ─────────────────────────────────────────────────────

const SECTION_THUMBS: Record<string, React.ReactNode> = {
  "announcement-bar": <><B x={0} y={0} w={80} h={9} o={0.8} r={0} /><T x={24} y={3.2} w={32} o={1} /><B x={4} y={14} w={72} h={32} o={0.08} /></>,
  "header": <><B x={0} y={14} w={80} h={16} o={0.1} r={0} /><B x={5} y={19} w={12} h={6} o={0.7} /><T x={30} y={21} w={7} /><T x={40} y={21} w={7} /><T x={50} y={21} w={7} /><C cx={72} cy={22} r={2.6} o={0.7} /></>,
  "hero-split": <><Img x={3} y={4} w={74} h={42} r={3} /><Heading x={0} y={16} w={36} center /><T x={26} y={23} w={28} /><P x={33} y={30} /></>,
  "page-header": <><B x={0} y={10} w={80} h={28} o={0.14} r={0} /><Heading x={6} y={17} w={28} /><T x={6} y={25} w={18} o={0.4} /><Img x={56} y={14} w={18} h={20} r={2} /></>,
  "payday-countdown": <><B x={0} y={8} w={80} h={34} o={0.85} r={3} />{[0, 1, 2, 3].map((i) => <rect key={i} x={30 + i * 9} y={18} width={7} height={9} rx={1.5} fill="#fff" opacity={0.85} />)}<rect x={6} y={18} width={18} height={3} rx={1.5} fill="#fff" opacity={0.7} /><rect x={6} y={24} width={12} height={2.4} rx={1.2} fill="#fff" opacity={0.45} /><rect x={68} y={20} width={8} height={5} rx={2.5} fill="#fff" opacity={0.9} /></>,
  "promo-banner": <><B x={4} y={8} w={72} h={34} o={0.22} r={4} /><Heading x={0} y={16} w={34} center /><T x={28} y={23} w={24} /><P x={33} y={30} /></>,
  "trust-strip": <>{[0, 1, 2, 3].map((i) => <g key={i}><C cx={12 + i * 19} cy={20} r={4} o={0.55} /><T x={6 + i * 19} y={28} w={12} /></g>)}</>,
  "featured-products": <><Heading x={4} y={5} w={26} />{[0, 1, 2, 3].map((i) => <Card key={i} x={4 + i * 18.5} y={13} w={16} h={30} />)}</>,
  "category-grid": <><Heading x={0} y={5} w={30} center />{[0, 1, 2, 3].map((i) => <g key={i}><C cx={14 + i * 17.5} cy={24} r={7} o={0.2} /><T x={9 + i * 17.5} y={35} w={10} /></g>)}</>,
  "story-split": <><Img x={4} y={6} w={34} h={38} r={3} /><Heading x={44} y={13} w={26} /><T x={44} y={20} w={30} /><T x={44} y={25} w={28} /><T x={44} y={30} w={22} /><PO x={44} y={36} /></>,
  "text-columns": <>{[0, 1, 2].map((i) => <g key={i}><T x={5 + i * 25} y={12} w={18} o={0.75} h={3} /><T x={5 + i * 25} y={19} w={21} /><T x={5 + i * 25} y={24} w={19} /><T x={5 + i * 25} y={29} w={16} /></g>)}</>,
  "testimonials": <><Heading x={0} y={5} w={30} center />{[0, 1, 2].map((i) => <g key={i}><B x={4 + i * 25} y={13} w={22} h={31} o={0.1} r={3} /><Stars x={7 + i * 25} y={17} n={4} /><T x={7 + i * 25} y={24} w={16} /><T x={7 + i * 25} y={29} w={13} /><C cx={10 + i * 25} cy={38} r={2.2} o={0.5} /></g>)}</>,
  "faq": <><Heading x={4} y={4} w={22} />{[0, 1, 2, 3].map((i) => <g key={i}><B x={4} y={11 + i * 9.5} w={72} h={7.5} o={0.12} /><T x={7} y={13.6 + i * 9.5} w={30 + (i % 2) * 10} /><Chevron x={71} y={14.8 + i * 9.5} /></g>)}</>,
  "about-section": <><Heading x={0} y={10} w={34} center /><T x={14} y={19} w={52} /><T x={17} y={24} w={46} /><T x={20} y={29} w={40} /><T x={25} y={34} w={30} /></>,
  "delivery-info": <><Heading x={4} y={5} w={26} />{[0, 1, 2].map((i) => <g key={i}><B x={4} y={13 + i * 11} w={9} h={8} o={0.35} /><T x={17} y={14.5 + i * 11} w={30} o={0.65} /><T x={17} y={18.5 + i * 11} w={44} /></g>)}</>,
  "payment-info": <><Heading x={4} y={5} w={26} />{[0, 1, 2].map((i) => <g key={i}><B x={4 + i * 25} y={15} w={22} h={14} o={0.18} r={2.5} /><B x={7 + i * 25} y={19} w={6} h={4} o={0.5} r={1} /><T x={7 + i * 25} y={33} w={16} /></g>)}</>,
  "newsletter": <><B x={4} y={6} w={72} h={38} o={0.08} r={4} /><Heading x={0} y={13} w={36} center /><T x={22} y={20} w={36} /><B x={14} y={28} w={36} h={7} o={0.2} r={3.5} /><P x={52} y={28} w={14} h={7} /></>,
  "contact-form": <><Heading x={4} y={4} w={26} /><B x={4} y={11} w={34} h={6} o={0.16} /><B x={42} y={11} w={34} h={6} o={0.16} /><B x={4} y={20} w={72} h={14} o={0.16} /><P x={4} y={38} w={18} h={6} /></>,
  "blog-index": <><Heading x={4} y={4} w={24} />{[0, 1, 2].map((i) => <g key={i}><Img x={4 + i * 25} y={11} w={22} h={16} /><T x={4 + i * 25} y={30} w={20} o={0.7} /><T x={4 + i * 25} y={35} w={16} /><T x={4 + i * 25} y={39.5} w={12} /></g>)}</>,
  "spin-wheel": <><circle cx={28} cy={25} r={17} fill="currentColor" opacity={0.15} />{[0, 45, 90, 135].map((a) => <line key={a} x1={28 + 17 * Math.cos((a * Math.PI) / 180)} y1={25 + 17 * Math.sin((a * Math.PI) / 180)} x2={28 - 17 * Math.cos((a * Math.PI) / 180)} y2={25 - 17 * Math.sin((a * Math.PI) / 180)} stroke="currentColor" strokeWidth={0.8} opacity={0.6} />)}<C cx={28} cy={25} r={3} o={0.85} /><path d="M28 5 l-2 -3 h4z" fill="currentColor" opacity={0.85} /><T x={52} y={17} w={22} o={0.75} h={3} /><T x={52} y={23} w={18} /><P x={52} y={30} w={18} /></>,
  "scratch-card": <><B x={10} y={8} w={60} h={34} o={0.12} r={4} /><B x={18} y={15} w={44} h={16} o={0.45} r={2} />{[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={20 + i * 7} y1={30} x2={26 + i * 7} y2={16} stroke="#fff" strokeWidth={0.9} opacity={0.6} />)}<T x={28} y={35} w={24} /></>,
  "reward-progress": <><T x={4} y={13} w={40} o={0.7} h={3} /><B x={4} y={22} w={72} h={6} o={0.14} r={3} /><B x={4} y={22} w={46} h={6} o={0.75} r={3} /><C cx={50} cy={25} r={4} o={0.9} /><T x={4} y={33} w={22} /><T x={58} y={33} w={18} /></>,
  "loyalty-banner": <><Heading x={4} y={6} w={34} /><T x={4} y={13} w={46} />{[0, 1, 2].map((i) => <g key={i}><B x={4 + i * 25} y={20} w={22} h={22} o={0.1 + i * 0.08} r={3} /><Stars x={7 + i * 25} y={24} n={i + 1} /><T x={7 + i * 25} y={33} w={14} /></g>)}</>,
  // Ready-made blocks (2026 themes)
  "split-hero": <><Img x={42} y={4} w={35} h={42} r={3} /><T x={4} y={11} w={14} o={0.5} h={2} /><T x={4} y={16} w={32} o={0.8} h={3.6} /><T x={4} y={21.5} w={26} o={0.8} h={3.6} /><T x={4} y={28} w={30} /><P x={4} y={35} /><PO x={20} y={35} /></>,
  "parallax-banner": <><Img x={0} y={2} w={80} h={46} r={0} /><B x={0} y={2} w={80} h={46} o={0.2} r={0} /><P x={34} y={10} w={12} h={4} o={0.6} /><Heading x={0} y={18} w={40} center /><T x={25} y={25} w={30} /><P x={31} y={32} w={18} /></>,
  "ticker-bar": <><B x={0} y={19} w={80} h={12} o={0.8} r={0} />{[0, 1, 2, 3].map((i) => <g key={i}><rect x={3 + i * 20} y={23.7} width={12} height={2.6} rx={1.3} fill="#fff" opacity={0.85} /><circle cx={18 + i * 20} cy={25} r={1} fill="#fff" opacity={0.85} /></g>)}</>,
  "video-hero": <><B x={0} y={2} w={80} h={46} o={0.35} r={0} /><Play cx={40} cy={20} r={6} /><T x={22} y={31} w={36} o={0.8} h={3.4} /><P x={33} y={38} /></>,
  "collection-grid": <><Heading x={4} y={3} w={26} />{[0, 1, 2, 3].map((i) => <g key={i}><Img x={4 + (i % 2) * 37} y={9 + Math.floor(i / 2) * 20} w={35} h={18} /><T x={7 + (i % 2) * 37} y={22 + Math.floor(i / 2) * 20} w={14} o={0.9} /></g>)}</>,
  "product-carousel": <><Heading x={4} y={5} w={28} />{[0, 1, 2, 3].map((i) => <Card key={i} x={8 + i * 16.5} y={13} w={14.5} h={28} />)}<Arrow cx={5} cy={23} dir="left" /><Arrow cx={75} cy={23} dir="right" /></>,
  "tabbed-products": <><P x={14} y={5} w={16} o={0.85} /><PO x={32} y={5} w={16} /><PO x={50} y={5} w={16} />{[0, 1, 2, 3].map((i) => <Card key={i} x={4 + i * 18.5} y={15} w={16} h={28} />)}</>,
  "shop-the-look": <><Img x={4} y={4} w={40} h={42} r={3} /><C cx={16} cy={18} r={2.6} o={0.9} /><C cx={32} cy={30} r={2.6} o={0.9} /><Card x={50} y={6} w={12} h={18} /><Card x={65} y={6} w={12} h={18} /><Card x={50} y={27} w={12} h={18} /></>,
  "compare-table": <><B x={4} y={6} w={72} h={8} o={0.2} r={1.5} />{[0, 1, 2, 3].map((i) => <g key={i}><T x={7} y={18.5 + i * 7.5} w={22} /><Check x={40} y={19.5 + i * 7.5} /><Check x={56} y={19.5 + i * 7.5} o={i % 2 ? 0.25 : 0.85} /><Check x={70} y={19.5 + i * 7.5} o={i === 3 ? 0.25 : 0.85} /><line x1={4} x2={76} y1={23 + i * 7.5} y2={23 + i * 7.5} stroke="currentColor" strokeWidth={0.4} opacity={0.3} /></g>)}<T x={7} y={9} w={14} o={0.7} />{[38, 54, 68].map((x) => <T key={x} x={x} y={9} w={8} o={0.7} />)}</>,
  "trust-badges": <>{[0, 1, 2, 3].map((i) => <g key={i}><B x={4 + i * 18.5} y={12} w={16} h={26} o={0.1} r={3} /><C cx={12 + i * 18.5} cy={20} r={3.6} o={0.6} /><T x={7 + i * 18.5} y={27} w={10} o={0.7} /><T x={8 + i * 18.5} y={31.5} w={8} /></g>)}</>,
  "press-logos": <><T x={28} y={10} w={24} />{[0, 1, 2, 3].map((i) => <B key={i} x={5 + i * 18.5} y={20} w={15} h={8} o={0.32} r={1.5} />)}<T x={20} y={36} w={40} o={0.25} /></>,
  "review-carousel": <><B x={12} y={6} w={56} h={38} o={0.1} r={4} /><Stars x={31} y={11} /><T x={20} y={19} w={40} /><T x={23} y={24} w={34} /><T x={27} y={29} w={26} /><C cx={36} cy={37} r={2.5} o={0.5} /><T x={40} y={36} w={12} o={0.7} /><Arrow cx={6} cy={25} dir="left" /><Arrow cx={74} cy={25} dir="right" /></>,
  "ugc-grid": <><Heading x={0} y={3} w={30} center />{Array.from({ length: 8 }, (_, i) => <Img key={i} x={4 + (i % 4) * 18.5} y={10 + Math.floor(i / 4) * 19} w={16.5} h={17} />)}</>,
  "sales-pop": <><B x={4} y={4} w={72} h={42} o={0.06} r={3} /><B x={6} y={28} w={42} h={15} o={0.9} r={3} /><rect x={8} y={30} width={10} height={11} rx={1.5} fill="#fff" opacity={0.5} /><rect x={21} y={32} width={22} height={2.4} rx={1.2} fill="#fff" opacity={0.85} /><rect x={21} y={37} width={15} height={2} rx={1} fill="#fff" opacity={0.6} /></>,
  "founder-story": <><Img x={4} y={5} w={28} h={40} r={3} /><T x={38} y={9} w={14} o={0.5} h={2} /><Heading x={38} y={14} w={34} /><T x={38} y={22} w={38} /><T x={38} y={27} w={36} /><T x={38} y={32} w={30} /><path d="M38 41 q3 -5 6 0 t6 0 t6 -1" fill="none" stroke="currentColor" strokeWidth={1} opacity={0.8} strokeLinecap="round" /></>,
  "shoppable-story": <>{[0, 1, 2, 3].map((i) => <g key={i}><Img x={5 + i * 18} y={4} w={16} h={34} r={3} /><C cx={13 + i * 18} cy={30} r={2.2} o={0.85} /><T x={6 + i * 18} y={41.5} w={12} /></g>)}</>,
  "recently-viewed": <><circle cx={7} cy={7.5} r={3} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.7} /><path d="M7 6 v1.6 h1.4" fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.7} /><T x={12} y={6.3} w={24} o={0.75} h={3} />{[0, 1, 2, 3, 4].map((i) => <Card key={i} x={4 + i * 15} y={15} w={13} h={24} />)}</>,
  "also-like": <><Heading x={4} y={5} w={30} />{[0, 1, 2, 3].map((i) => <g key={i}><Card x={4 + i * 18.5} y={13} w={16} h={30} /><path d={`M${16 + i * 18.5} ${16} l1 1 l1 -1 a0.7 0.7 0 0 0 -1 -1 a0.7 0.7 0 0 0 -1 1z`} fill="currentColor" opacity={0.85} /></g>)}</>,
  "shipping-progress": <><B x={4} y={10} w={72} h={30} o={0.08} r={3} /><T x={10} y={16} w={44} o={0.75} /><B x={10} y={24} w={60} h={5} o={0.16} r={2.5} /><B x={10} y={24} w={38} h={5} o={0.8} r={2.5} /><B x={46} y={22} w={8} h={9} o={0.9} r={2} /><T x={10} y={33} w={22} /></>,
  "promo-popup": <><B x={0} y={0} w={80} h={50} o={0.25} r={0} /><B x={16} y={7} w={48} h={36} o={0.9} r={4} /><rect x={28} y={13} width={24} height={3.4} rx={1.7} fill="#fff" opacity={0.9} /><rect x={24} y={20} width={32} height={2.4} rx={1.2} fill="#fff" opacity={0.6} /><rect x={22} y={27} width={36} height={6} rx={3} fill="#fff" opacity={0.5} /><rect x={30} y={35} width={20} height={5} rx={2.5} fill="#fff" opacity={0.95} /></>,
  "size-finder": <><Heading x={4} y={5} w={24} />{[0, 1, 2, 3].map((i) => <g key={i}><B x={4} y={12 + i * 8} w={72} h={6} o={i === 1 ? 0.45 : 0.1} r={1.5} /><T x={7} y={13.7 + i * 8} w={8} o={0.8} /><T x={30} y={13.7 + i * 8} w={10} /><T x={56} y={13.7 + i * 8} w={10} /></g>)}<path d="M4 46 h72" stroke="currentColor" strokeWidth={0.8} opacity={0.5} />{Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${4 + i * 6} 46 v-${i % 2 ? 1.5 : 3}`} stroke="currentColor" strokeWidth={0.6} opacity={0.5} />)}</>,
  "campaign-countdown-hero": <><B x={0} y={2} w={80} h={46} o={0.85} r={0} /><rect x={26} y={9} width={28} height={3.4} rx={1.7} fill="#fff" opacity={0.9} />{[0, 1, 2, 3].map((i) => <rect key={i} x={17 + i * 12} y={17} width={9} height={11} rx={1.6} fill="#fff" opacity={0.3} />)}<rect x={30} y={35} width={20} height={6} rx={3} fill="#fff" opacity={0.95} /></>,
  "campaign-promo-strip": <><B x={0} y={18} w={80} h={14} o={0.85} r={0} /><rect x={10} y={23.7} width={30} height={2.6} rx={1.3} fill="#fff" opacity={0.85} /><rect x={46} y={21.5} width={24} height={7} rx={3.5} fill="none" stroke="#fff" strokeWidth={0.8} strokeDasharray="1.6 1.2" opacity={0.95} /></>,
  "campaign-deal-grid": <><Heading x={4} y={3} w={22} />{[0, 1, 2, 3].map((i) => <g key={i}><Card x={4 + i * 18.5} y={10} w={16} h={34} /><B x={5.5 + i * 18.5} y={11.5} w={7} h={3.4} o={0.9} r={1.7} /></g>)}</>,
  "campaign-featured-deal": <><Img x={4} y={4} w={34} h={42} r={3} /><B x={6} y={6} w={9} h={3.6} o={0.9} r={1.8} /><T x={44} y={9} w={20} o={0.8} /><T x={44} y={15} w={28} h={3.4} o={0.9} />{[0, 1, 2, 3].map((i) => <B key={i} x={44 + i * 8} y={23} w={6.5} h={8} o={0.25} r={1.2} />)}<P x={44} y={36} w={22} /></>,
  "campaign-gift-guide": <><Heading x={4} y={3} w={22} />{[0, 1, 2, 3].map((i) => <g key={i}><Img x={4 + i * 18.5} y={10} w={16} h={34} /><T x={6 + i * 18.5} y={38} w={10} o={0.95} /></g>)}</>,
};

// ─── Elements ────────────────────────────────────────────────────────────────

const ELEMENT_THUMBS: Record<string, React.ReactNode> = {
  "element:heading": <><text x={8} y={33} fontSize={22} fontWeight={700} fill="currentColor" opacity={0.85} fontFamily="Georgia, serif">H</text><T x={30} y={19} w={42} o={0.75} h={4} /><T x={30} y={27} w={30} o={0.75} h={4} /></>,
  "element:text": <><T x={8} y={12} w={64} /><T x={8} y={18} w={60} /><T x={8} y={24} w={64} /><T x={8} y={30} w={52} /><T x={8} y={36} w={40} /></>,
  "element:image": <Img x={12} y={6} w={56} h={38} r={3} />,
  "element:button": <><P x={20} y={19} w={40} h={12} o={0.85} /><rect x={30} y={23.8} width={20} height={2.4} rx={1.2} fill="#fff" opacity={0.9} /></>,
  "element:video": <><B x={10} y={6} w={60} h={38} o={0.3} r={3} /><Play cx={40} cy={25} r={7} /></>,
  "element:spacer": <><path d="M40 10 v30 M36 14 l4 -4 4 4 M36 36 l4 4 4 -4" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.8} /><path d="M10 9 h60 M10 41 h60" stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.5} /></>,
  "element:divider": <><T x={14} y={14} w={40} o={0.25} /><path d="M8 25 h64" stroke="currentColor" strokeWidth={1.4} opacity={0.8} /><T x={14} y={34} w={46} o={0.25} /></>,
  "element:icon-list": <>{[0, 1, 2].map((i) => <g key={i}><C cx={14} cy={14 + i * 11} r={3.2} o={0.75} /><Check x={12.4} y={14.2 + i * 11} o={1} /><T x={22} y={12.7 + i * 11} w={36 - i * 6} /></g>)}</>,
  "element:product": <><B x={24} y={3} w={32} h={44} o={0.08} r={3} /><Img x={27} y={6} w={26} h={24} /><T x={27} y={33} w={20} o={0.7} /><T x={27} y={37.5} w={12} o={0.9} h={2} /><P x={27} y={41} w={26} h={4} /></>,
};

// ─── Column layouts (drawn from the presets themselves) ──────────────────────

function LayoutPicture({ presetId }: { presetId: string }) {
  const preset = columnPreset(presetId);
  const rows = Math.ceil(preset.cells / preset.tracks.length);
  const total = preset.tracks.reduce((sum, track) => sum + track, 0);
  const gap = 3;
  const x0 = 6;
  const width = W - x0 * 2 - gap * (preset.tracks.length - 1);
  const height = (H - 12 - gap * (rows - 1)) / rows;
  let x = x0;
  const columns = preset.tracks.map((track) => {
    const w = (track / total) * width;
    const out = { x, w };
    x += w + gap;
    return out;
  });
  return (
    <>
      {Array.from({ length: preset.cells }, (_, index) => {
        const column = columns[index % columns.length]!;
        const y = 6 + Math.floor(index / columns.length) * (height + gap);
        return <Cell key={index} x={column.x} y={y} w={column.w} h={height} />;
      })}
    </>
  );
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

const GENERIC = <><Heading x={6} y={10} w={30} /><T x={6} y={18} w={60} /><T x={6} y={23} w={54} /><T x={6} y={28} w={40} /><B x={6} y={34} w={68} h={10} o={0.12} /></>;

/** Picture key for a section kind, layout preset ("layout:50-50") or element ("element:heading"). */
export function hasInsertThumb(kind: string) {
  if (kind.startsWith("layout:")) return COLUMN_PRESETS.some((preset) => `layout:${preset.id}` === kind);
  return kind in SECTION_THUMBS || kind in ELEMENT_THUMBS;
}

/** The wireframe picture for a kind; a generic text-and-box picture for anything without its own. */
export function InsertThumb({ kind, className }: { kind: string; className?: string }) {
  const content = kind.startsWith("layout:") ? <LayoutPicture presetId={kind.slice("layout:".length)} /> : SECTION_THUMBS[kind] ?? ELEMENT_THUMBS[kind] ?? GENERIC;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden focusable="false" preserveAspectRatio="xMidYMid meet">
      {content}
    </svg>
  );
}
