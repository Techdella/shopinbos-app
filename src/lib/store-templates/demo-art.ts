// Sample illustrations for theme previews: flat inline SVG objects (a dress, a jar, a tyre…) drawn in a theme's
// palette. They exist only to show what a theme looks like before the seller adds products; they are never saved
// to a store and carry no stock photos or brands. Pure functions, no imports, so tests can load this file directly.

export type DemoArtKind =
  | "dress" | "shirt" | "trousers" | "bag" | "robe" | "cap" | "fabric-roll" | "fabric-fold" | "gele"
  | "sneaker" | "heel" | "sandal" | "watch" | "ring" | "necklace" | "earrings" | "bracelet"
  | "perfume" | "jar" | "tube" | "dropper" | "lipstick" | "soap" | "wig" | "comb"
  | "plate" | "bowl" | "bottle" | "cup" | "cake" | "cupcake" | "snack-jar" | "bread" | "pie"
  | "phone" | "headphones" | "speaker" | "powerbank" | "laptop"
  | "book" | "notebook" | "pen" | "teddy" | "onesie" | "blocks"
  | "chair" | "balloons" | "canopy" | "lamp" | "vase" | "cushion" | "candle"
  | "tyre" | "battery" | "oil-can" | "wrench" | "headlamp"
  | "basket" | "eggs" | "yam" | "sack" | "leaf" | "pot";

export const DEMO_ART_KINDS: readonly DemoArtKind[] = [
  "dress", "shirt", "trousers", "bag", "robe", "cap", "fabric-roll", "fabric-fold", "gele",
  "sneaker", "heel", "sandal", "watch", "ring", "necklace", "earrings", "bracelet",
  "perfume", "jar", "tube", "dropper", "lipstick", "soap", "wig", "comb",
  "plate", "bowl", "bottle", "cup", "cake", "cupcake", "snack-jar", "bread", "pie",
  "phone", "headphones", "speaker", "powerbank", "laptop",
  "book", "notebook", "pen", "teddy", "onesie", "blocks",
  "chair", "balloons", "canopy", "lamp", "vase", "cushion", "candle",
  "tyre", "battery", "oil-can", "wrench", "headlamp",
  "basket", "eggs", "yam", "sack", "leaf", "pot",
];

export interface DemoPalette {
  /** Background behind the object. */
  bg: string;
  /** The object's main colour. */
  main: string;
  /** Details: trims, labels, stones. */
  accent: string;
  /** Lines and shadows. */
  ink: string;
}

type C = { m: string; a: string; k: string; l: string };

const shadow = (c: C, rx = 26) => `<ellipse cx="50" cy="88" rx="${rx}" ry="3.6" fill="${c.k}" opacity=".13"/>`;

function dots(c: C, x: number, y: number, w: number, h: number, step = 7, r = 1.4) {
  let out = "";
  for (let i = x + step / 2; i < x + w; i += step) for (let j = y + step / 2; j < y + h; j += step) out += `<circle cx="${i.toFixed(1)}" cy="${j.toFixed(1)}" r="${r}" fill="${c.a}" opacity=".85"/>`;
  return out;
}

function beadArc(c: C, cx: number, cy: number, r: number, from: number, to: number, count: number, size: number) {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const t = from + ((to - from) * i) / (count - 1);
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${i % 3 === 1 ? c.a : c.m}"/>`;
  }
  return out;
}

const MOTIFS: Record<DemoArtKind, (c: C) => string> = {
  dress: (c) => `${shadow(c, 22)}<path d="M41 14h18l-2 14 15 56H28l15-56z" fill="${c.m}"/><path d="M43 14c2 5 12 5 14 0" fill="none" stroke="${c.k}" stroke-width="1.5" opacity=".35"/><rect x="40" y="36" width="20" height="4" rx="2" fill="${c.a}"/>${dots(c, 34, 46, 32, 34, 8, 1.6)}`,
  shirt: (c) => `${shadow(c)}<path d="M36 18l-16 10 7 13 8-4v46h30V37l8 4 7-13-16-10c-2 6-7 9-14 9s-12-3-14-9z" fill="${c.m}"/><path d="M50 27v54" stroke="${c.k}" stroke-width="1" opacity=".3"/><circle cx="50" cy="40" r="1.6" fill="${c.a}"/><circle cx="50" cy="52" r="1.6" fill="${c.a}"/><circle cx="50" cy="64" r="1.6" fill="${c.a}"/>`,
  trousers: (c) => `${shadow(c, 20)}<path d="M35 14h30l4 72H54l-4-46-4 46H31z" fill="${c.m}"/><rect x="35" y="14" width="30" height="6" fill="${c.a}"/>`,
  bag: (c) => `${shadow(c)}<path d="M38 38c0-12 5-19 12-19s12 7 12 19" fill="none" stroke="${c.k}" stroke-width="3.2" stroke-linecap="round"/><rect x="24" y="36" width="52" height="46" rx="8" fill="${c.m}"/><rect x="24" y="36" width="52" height="12" rx="6" fill="${c.k}" opacity=".12"/><rect x="44" y="48" width="12" height="7" rx="2" fill="${c.a}"/>`,
  robe: (c) => `${shadow(c, 30)}<path d="M50 14L14 40l6 12 12-6-3 40h42l-3-40 12 6 6-12z" fill="${c.m}"/><path d="M43 16l7 20 7-20" fill="none" stroke="${c.a}" stroke-width="2.6"/><path d="M38 46h24" stroke="${c.a}" stroke-width="1.6" stroke-dasharray="2 2"/>`,
  cap: (c) => `${shadow(c, 24)}<path d="M26 66c0-18 10-30 24-30s24 12 24 30z" fill="${c.m}"/><rect x="24" y="64" width="52" height="8" rx="3" fill="${c.a}"/>${dots(c, 30, 44, 40, 18, 7, 1.2)}`,
  "fabric-roll": (c) => `${shadow(c, 32)}<rect x="22" y="28" width="58" height="46" rx="4" fill="${c.m}"/>${dots(c, 26, 30, 52, 42, 8, 2)}<ellipse cx="22" cy="51" rx="7" ry="23" fill="${c.a}"/><ellipse cx="22" cy="51" rx="2.4" ry="7" fill="${c.k}" opacity=".4"/>`,
  "fabric-fold": (c) => `${shadow(c, 30)}<rect x="20" y="56" width="60" height="16" rx="3" fill="${c.m}"/><rect x="24" y="42" width="54" height="16" rx="3" fill="${c.a}"/><rect x="22" y="28" width="56" height="16" rx="3" fill="${c.m}" opacity=".85"/>${dots(c, 22, 28, 56, 16, 6, 1.1)}<path d="M20 72q5-4 10 0t10 0 10 0 10 0 10 0 10 0" fill="none" stroke="${c.l}" stroke-width="1.2" opacity=".7"/>`,
  gele: (c) => `${shadow(c, 22)}<circle cx="50" cy="60" r="15" fill="${c.k}" opacity=".18"/><path d="M22 52c4-22 18-34 28-34s24 12 28 34c-8-6-16-8-28-8s-20 2-28 8z" fill="${c.m}"/><path d="M30 44c6-10 12-16 20-18M70 44c-6-10-12-16-20-18M50 22v20" stroke="${c.a}" stroke-width="2" fill="none"/>`,
  sneaker: (c) => `${shadow(c, 34)}<path d="M16 64c0-9 4-20 10-24l12 7c7 4 15 6 24 6 11 0 20 4 22 13v6H16z" fill="${c.m}"/><rect x="15" y="68" width="70" height="8" rx="4" fill="${c.l}" stroke="${c.k}" stroke-opacity=".15"/><path d="M34 47l6-4M39 50l6-4M44 52l6-4" stroke="${c.l}" stroke-width="2" stroke-linecap="round"/><path d="M60 58c6 0 12 2 16 6" stroke="${c.a}" stroke-width="3" fill="none"/>`,
  heel: (c) => `${shadow(c, 28)}<path d="M22 56c10 0 20 6 30 14h26c4 0 6 2 6 5v3H44c-10-8-16-12-22-12z" fill="${c.m}"/><path d="M22 56l-2 28h4l3-26" fill="${c.k}"/><path d="M42 62c6-4 12-6 20-6" stroke="${c.a}" stroke-width="2.4" fill="none"/>`,
  sandal: (c) => `${shadow(c, 30)}<rect x="18" y="66" width="64" height="9" rx="4.5" fill="${c.k}" opacity=".75"/><path d="M30 66c2-12 8-18 20-18s18 6 20 18" fill="none" stroke="${c.m}" stroke-width="7"/><circle cx="50" cy="50" r="4" fill="${c.a}"/>`,
  watch: (c) => `${shadow(c, 16)}<rect x="40" y="10" width="20" height="80" rx="6" fill="${c.k}" opacity=".85"/><circle cx="50" cy="50" r="19" fill="${c.a}"/><circle cx="50" cy="50" r="15" fill="${c.l}"/><path d="M50 50V40M50 50l7 4" stroke="${c.k}" stroke-width="2" stroke-linecap="round"/>`,
  ring: (c) => `${shadow(c, 16)}<circle cx="50" cy="58" r="18" fill="none" stroke="${c.a}" stroke-width="6"/><path d="M42 36l8-10 8 10-8 8z" fill="${c.m}"/><path d="M42 36h16" stroke="${c.l}" stroke-width="1" opacity=".6"/>`,
  necklace: (c) => `${shadow(c, 18)}<path d="M24 22c0 30 12 44 26 44s26-14 26-44" fill="none" stroke="${c.k}" stroke-width="1" opacity=".35"/>${beadArc(c, 50, 30, 30, 0.2, Math.PI - 0.2, 15, 3.4)}<circle cx="50" cy="66" r="6" fill="${c.a}"/>`,
  earrings: (c) => `${shadow(c, 24)}<circle cx="34" cy="38" r="12" fill="none" stroke="${c.a}" stroke-width="3"/><circle cx="66" cy="38" r="12" fill="none" stroke="${c.a}" stroke-width="3"/><circle cx="34" cy="60" r="6" fill="${c.m}"/><circle cx="66" cy="60" r="6" fill="${c.m}"/><circle cx="34" cy="72" r="4" fill="${c.m}" opacity=".75"/><circle cx="66" cy="72" r="4" fill="${c.m}" opacity=".75"/>`,
  bracelet: (c) => `${shadow(c, 24)}${beadArc(c, 50, 54, 22, 0, Math.PI * 2 - 0.3, 16, 4.6)}`,
  perfume: (c) => `${shadow(c, 20)}<rect x="44" y="16" width="12" height="10" rx="2" fill="${c.a}"/><rect x="47" y="25" width="6" height="7" fill="${c.k}" opacity=".5"/><rect x="28" y="31" width="44" height="52" rx="10" fill="${c.m}"/><rect x="34" y="37" width="12" height="40" rx="6" fill="${c.l}" opacity=".35"/><rect x="40" y="56" width="20" height="10" rx="2" fill="${c.l}" opacity=".85"/>`,
  jar: (c) => `${shadow(c, 24)}<rect x="28" y="34" width="44" height="12" rx="4" fill="${c.a}"/><rect x="26" y="44" width="48" height="38" rx="10" fill="${c.m}"/><rect x="34" y="56" width="32" height="14" rx="3" fill="${c.l}" opacity=".85"/>`,
  tube: (c) => `${shadow(c, 14)}<path d="M38 16h24l-2 56H40z" fill="${c.m}"/><rect x="40" y="72" width="20" height="14" rx="3" fill="${c.a}"/><rect x="42" y="30" width="16" height="22" rx="2" fill="${c.l}" opacity=".7"/>`,
  dropper: (c) => `${shadow(c, 18)}<rect x="45" y="10" width="10" height="14" rx="5" fill="${c.k}" opacity=".85"/><rect x="42" y="23" width="16" height="9" rx="2" fill="${c.a}"/><rect x="34" y="32" width="32" height="52" rx="8" fill="${c.m}" opacity=".9"/><rect x="38" y="52" width="24" height="14" rx="2" fill="${c.l}" opacity=".85"/>`,
  lipstick: (c) => `${shadow(c, 14)}<path d="M42 22l16-8v26H42z" fill="${c.a}"/><rect x="40" y="38" width="20" height="12" fill="${c.k}" opacity=".3"/><rect x="38" y="48" width="24" height="36" rx="3" fill="${c.m}"/>`,
  soap: (c) => `${shadow(c, 28)}<rect x="22" y="44" width="56" height="30" rx="12" fill="${c.m}"/><ellipse cx="50" cy="52" rx="20" ry="5" fill="${c.l}" opacity=".35"/><circle cx="68" cy="34" r="5" fill="none" stroke="${c.a}" stroke-width="1.6"/><circle cx="76" cy="26" r="3" fill="none" stroke="${c.a}" stroke-width="1.4"/>`,
  wig: (c) => `${shadow(c, 24)}<ellipse cx="50" cy="44" rx="13" ry="16" fill="${c.k}" opacity=".16"/><path d="M28 84c-6-34 0-66 22-66s28 32 22 66c-4-14-6-30-8-42-4 4-9 6-14 6s-10-2-14-6c-2 12-4 28-8 42z" fill="${c.m}"/><path d="M36 30c4-6 10-8 14-8" stroke="${c.a}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  comb: (c) => `${shadow(c, 26)}<rect x="22" y="30" width="56" height="14" rx="5" fill="${c.m}"/>${Array.from({ length: 11 }, (_, i) => `<rect x="${25 + i * 5}" y="43" width="2.6" height="${i % 2 ? 26 : 32}" rx="1.3" fill="${c.m}"/>`).join("")}`,
  plate: (c) => `${shadow(c, 34)}<circle cx="50" cy="54" r="33" fill="${c.l}"/><circle cx="50" cy="54" r="27" fill="none" stroke="${c.k}" stroke-opacity=".08"/><path d="M28 56c2-12 12-20 24-20 10 0 18 6 20 14-6 10-16 16-26 16-8 0-14-4-18-10z" fill="${c.m}"/><circle cx="60" cy="48" r="6" fill="${c.a}"/><circle cx="40" cy="52" r="2" fill="${c.a}"/><circle cx="48" cy="58" r="2" fill="${c.a}"/><path d="M56 62c4 2 8 2 12-2" stroke="#4E8A3A" stroke-width="2.4" fill="none"/>`,
  bowl: (c) => `${shadow(c, 32)}<ellipse cx="50" cy="48" rx="32" ry="8" fill="${c.a}"/><path d="M18 48c0 20 14 32 32 32s32-12 32-32z" fill="${c.m}"/><path d="M26 54c6 4 14 6 24 6" stroke="${c.l}" stroke-width="2" opacity=".5" fill="none"/>`,
  bottle: (c) => `${shadow(c, 16)}<rect x="44" y="12" width="12" height="8" rx="2" fill="${c.a}"/><path d="M44 20h12v10c8 4 10 10 10 18v34c0 3-2 4-5 4H39c-3 0-5-1-5-4V48c0-8 2-14 10-18z" fill="${c.m}"/><rect x="36" y="52" width="28" height="18" rx="2" fill="${c.l}" opacity=".88"/><rect x="40" y="58" width="20" height="2.5" rx="1" fill="${c.a}"/>`,
  cup: (c) => `${shadow(c, 20)}<path d="M54 10l-6 22" stroke="${c.a}" stroke-width="3" stroke-linecap="round"/><path d="M30 30h40l-6 54H36z" fill="${c.m}"/><rect x="28" y="28" width="44" height="6" rx="3" fill="${c.l}"/><rect x="34" y="50" width="32" height="10" fill="${c.l}" opacity=".6"/>`,
  cake: (c) => `${shadow(c, 32)}<rect x="22" y="56" width="56" height="26" rx="5" fill="${c.m}"/><rect x="30" y="36" width="40" height="22" rx="5" fill="${c.m}" opacity=".9"/><path d="M22 60q7 6 14 0t14 0 14 0 14 0" fill="${c.l}"/><path d="M30 40q5 5 10 0t10 0 10 0 10 0" fill="${c.l}"/><circle cx="50" cy="31" r="4.5" fill="${c.a}"/>`,
  cupcake: (c) => `${shadow(c, 20)}<path d="M30 54h40l-6 30H36z" fill="${c.a}"/><path d="M34 56l2 26M42 56l1 26M50 56v26M58 56l-1 26M66 56l-2 26" stroke="${c.k}" stroke-opacity=".15"/><path d="M28 56c-2-12 8-18 14-18 2-8 14-10 18-2 10 0 14 10 12 20z" fill="${c.m}"/><circle cx="52" cy="30" r="4.5" fill="${c.a}"/>`,
  "snack-jar": (c) => `${shadow(c, 22)}<rect x="32" y="16" width="36" height="10" rx="3" fill="${c.a}"/><rect x="28" y="25" width="44" height="58" rx="9" fill="${c.l}" opacity=".7" stroke="${c.k}" stroke-opacity=".12"/>${Array.from({ length: 18 }, (_, i) => `<rect x="${33 + (i % 5) * 7 + ((i / 5) | 0) % 2 * 3}" y="${38 + ((i / 5) | 0) * 10}" width="5" height="5" rx="1.2" fill="${c.m}" transform="rotate(${(i * 37) % 60 - 30} ${35 + (i % 5) * 7} ${40 + ((i / 5) | 0) * 10})"/>`).join("")}<rect x="36" y="64" width="28" height="9" rx="2" fill="${c.a}" opacity=".9"/>`,
  bread: (c) => `${shadow(c, 32)}<path d="M18 64c0-16 14-26 32-26s32 10 32 26v12H18z" fill="${c.m}"/><path d="M34 46l6 10M48 42l6 12M62 46l6 10" stroke="${c.l}" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>`,
  pie: (c) => `${shadow(c, 30)}<path d="M18 68c0-18 14-30 32-30s32 12 32 30z" fill="${c.m}"/><path d="M18 68h64" stroke="${c.a}" stroke-width="4"/>${Array.from({ length: 9 }, (_, i) => `<circle cx="${22 + i * 7}" cy="68" r="2.4" fill="${c.a}"/>`).join("")}<path d="M38 52l4 4M50 48l4 4M62 52l4 4" stroke="${c.k}" stroke-opacity=".25" stroke-width="2" stroke-linecap="round"/>`,
  phone: (c) => `${shadow(c, 18)}<rect x="32" y="12" width="36" height="74" rx="8" fill="${c.k}"/><rect x="35" y="17" width="30" height="64" rx="5" fill="${c.m}"/><circle cx="50" cy="20" r="1.4" fill="${c.k}"/><path d="M35 60c10-10 20-6 30-16v37H35z" fill="${c.a}" opacity=".6"/>`,
  headphones: (c) => `${shadow(c, 26)}<path d="M24 58V48c0-16 12-28 26-28s26 12 26 28v10" fill="none" stroke="${c.k}" stroke-width="5" stroke-linecap="round"/><rect x="18" y="52" width="14" height="26" rx="6" fill="${c.m}"/><rect x="68" y="52" width="14" height="26" rx="6" fill="${c.m}"/><rect x="22" y="58" width="6" height="14" rx="3" fill="${c.a}"/><rect x="72" y="58" width="6" height="14" rx="3" fill="${c.a}"/>`,
  speaker: (c) => `${shadow(c, 24)}<rect x="28" y="16" width="44" height="70" rx="10" fill="${c.m}"/><circle cx="50" cy="60" r="14" fill="${c.k}" opacity=".85"/><circle cx="50" cy="60" r="6" fill="${c.a}"/><circle cx="50" cy="32" r="7" fill="${c.k}" opacity=".85"/>`,
  powerbank: (c) => `${shadow(c, 18)}<rect x="32" y="16" width="36" height="70" rx="7" fill="${c.m}"/><rect x="44" y="12" width="12" height="5" rx="1.5" fill="${c.k}"/>${[0, 1, 2, 3].map((i) => `<rect x="${38 + i * 6.5}" y="70" width="4.5" height="6" rx="1" fill="${i < 3 ? c.a : c.l}"/>`).join("")}`,
  laptop: (c) => `${shadow(c, 38)}<rect x="22" y="22" width="56" height="38" rx="3" fill="${c.k}"/><rect x="25" y="25" width="50" height="32" rx="1.5" fill="${c.m}"/><path d="M14 64h72l-5 10H19z" fill="${c.k}" opacity=".8"/><path d="M25 48c12-8 24-2 50-14v23H25z" fill="${c.a}" opacity=".55"/>`,
  book: (c) => `${shadow(c, 22)}<rect x="28" y="12" width="44" height="72" rx="2" fill="${c.m}"/><rect x="28" y="12" width="6" height="72" fill="${c.k}" opacity=".2"/><rect x="40" y="28" width="24" height="3" rx="1.5" fill="${c.l}"/><rect x="40" y="35" width="18" height="3" rx="1.5" fill="${c.l}" opacity=".8"/><circle cx="52" cy="58" r="8" fill="${c.a}"/><rect x="40" y="74" width="20" height="2.4" rx="1.2" fill="${c.l}" opacity=".8"/>`,
  notebook: (c) => `${shadow(c, 24)}<rect x="28" y="14" width="46" height="70" rx="4" fill="${c.m}"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="28" cy="${20 + i * 8.6}" r="2.6" fill="none" stroke="${c.k}" stroke-width="1.4"/>`).join("")}<rect x="38" y="30" width="28" height="12" rx="2" fill="${c.l}" opacity=".85"/><rect x="62" y="14" width="5" height="22" fill="${c.a}"/>`,
  pen: (c) => `${shadow(c, 18)}<g transform="rotate(-35 50 50)"><rect x="46" y="10" width="8" height="66" rx="3" fill="${c.m}"/><path d="M46 76h8l-4 12z" fill="${c.k}"/><rect x="53" y="16" width="2.6" height="22" rx="1" fill="${c.a}"/></g>`,
  teddy: (c) => `${shadow(c, 24)}<circle cx="36" cy="24" r="7" fill="${c.m}"/><circle cx="64" cy="24" r="7" fill="${c.m}"/><circle cx="50" cy="34" r="15" fill="${c.m}"/><ellipse cx="50" cy="66" rx="20" ry="20" fill="${c.m}"/><ellipse cx="50" cy="68" rx="10" ry="11" fill="${c.l}" opacity=".5"/><circle cx="44" cy="32" r="1.8" fill="${c.k}"/><circle cx="56" cy="32" r="1.8" fill="${c.k}"/><ellipse cx="50" cy="39" rx="4" ry="3" fill="${c.k}" opacity=".7"/><path d="M42 48h16" stroke="${c.a}" stroke-width="4" stroke-linecap="round"/>`,
  onesie: (c) => `${shadow(c, 22)}<path d="M38 16c2 5 6 7 12 7s10-2 12-7l16 10-6 12-6-3v26l-8 18h-6l-2-8-2 8h-6l-8-18V35l-6 3-6-12z" fill="${c.m}"/><circle cx="50" cy="44" r="6" fill="${c.a}"/>`,
  blocks: (c) => `${shadow(c, 30)}<rect x="22" y="56" width="26" height="26" rx="4" fill="${c.m}"/><rect x="52" y="56" width="26" height="26" rx="4" fill="${c.a}"/><rect x="37" y="28" width="26" height="26" rx="4" fill="${c.m}" opacity=".8"/><path d="M30 76l5-14 5 14M60 62h8a4 4 0 010 8h-8zm0 8h9a4 4 0 010 8h-9z" fill="none" stroke="${c.l}" stroke-width="2"/>`,
  chair: (c) => `${shadow(c, 22)}<path d="M34 14h32v40H34z" fill="none" stroke="${c.m}" stroke-width="4"/>${[42, 50, 58].map((x) => `<path d="M${x} 16v36" stroke="${c.m}" stroke-width="3"/>`).join("")}<rect x="30" y="52" width="40" height="7" rx="2" fill="${c.a}"/><path d="M34 59l-3 27M66 59l3 27M40 59l-1 24M60 59l1 24" stroke="${c.m}" stroke-width="3.4" stroke-linecap="round"/>`,
  balloons: (c) => `<path d="M34 46c4 14 10 26 16 40M56 40c-2 16-4 30-6 46M72 50c-6 12-14 24-22 36" fill="none" stroke="${c.k}" stroke-opacity=".3" stroke-width="1.2"/><ellipse cx="32" cy="32" rx="13" ry="16" fill="${c.m}"/><ellipse cx="58" cy="26" rx="13" ry="16" fill="${c.a}"/><ellipse cx="72" cy="42" rx="11" ry="14" fill="${c.m}" opacity=".75"/><ellipse cx="28" cy="26" rx="3" ry="5" fill="${c.l}" opacity=".45"/>`,
  canopy: (c) => `${shadow(c, 38)}<path d="M12 40L50 16l38 24z" fill="${c.m}"/><path d="M12 40q6.3 8 12.7 0t12.6 0 12.7 0 12.6 0 12.7 0 12.7 0" fill="${c.a}"/><path d="M16 42v44M84 42v44" stroke="${c.k}" stroke-width="2.6"/>`,
  lamp: (c) => `${shadow(c, 18)}<path d="M34 16h32l8 30H26z" fill="${c.m}"/><path d="M50 46v34" stroke="${c.k}" stroke-width="3"/><ellipse cx="50" cy="82" rx="14" ry="4" fill="${c.a}"/>`,
  vase: (c) => `${shadow(c, 18)}<path d="M42 14h16v8c10 6 14 16 14 30 0 18-8 32-22 32S28 70 28 52c0-14 4-24 14-30z" fill="${c.m}"/><path d="M34 50h32" stroke="${c.a}" stroke-width="3"/><path d="M36 58h28" stroke="${c.a}" stroke-width="1.4"/>`,
  cushion: (c) => `${shadow(c, 32)}<path d="M20 26q30-8 60 0-6 26 0 52-30 8-60 0 6-26 0-52z" fill="${c.m}"/>${dots(c, 30, 32, 40, 40, 9, 2)}`,
  candle: (c) => `${shadow(c, 18)}<path d="M50 14c5 6 5 11 0 15-5-4-5-9 0-15z" fill="${c.a}"/><path d="M50 28v6" stroke="${c.k}" stroke-width="1.4"/><rect x="34" y="34" width="32" height="50" rx="6" fill="${c.m}"/><rect x="34" y="54" width="32" height="10" fill="${c.l}" opacity=".5"/>`,
  tyre: (c) => `${shadow(c, 30)}<circle cx="50" cy="50" r="34" fill="${c.k}"/>${Array.from({ length: 16 }, (_, i) => `<rect x="48" y="16" width="4" height="7" rx="1" fill="${c.l}" opacity=".18" transform="rotate(${i * 22.5} 50 50)"/>`).join("")}<circle cx="50" cy="50" r="20" fill="${c.m}"/><circle cx="50" cy="50" r="6" fill="${c.a}"/>${Array.from({ length: 5 }, (_, i) => `<rect x="48.5" y="33" width="3" height="10" rx="1.5" fill="${c.k}" opacity=".35" transform="rotate(${i * 72} 50 50)"/>`).join("")}`,
  battery: (c) => `${shadow(c, 32)}<rect x="18" y="34" width="64" height="46" rx="5" fill="${c.k}"/><rect x="26" y="26" width="10" height="9" rx="1.5" fill="${c.m}"/><rect x="64" y="26" width="10" height="9" rx="1.5" fill="${c.m}"/><rect x="24" y="44" width="52" height="14" rx="2" fill="${c.a}"/><path d="M30 51h6M64 51h6M67 48v6" stroke="${c.k}" stroke-width="2"/>`,
  "oil-can": (c) => `${shadow(c, 24)}<path d="M30 30h30l12 12v42H30z" fill="${c.m}"/><rect x="58" y="18" width="10" height="10" rx="2" fill="${c.k}"/><path d="M34 22h16v8H34z" fill="none" stroke="${c.k}" stroke-width="3"/><rect x="36" y="50" width="28" height="18" rx="2" fill="${c.a}"/><path d="M50 54c3 4 3 7 0 9-3-2-3-5 0-9z" fill="${c.k}"/>`,
  wrench: (c) => `${shadow(c, 26)}<g transform="rotate(40 50 50)"><rect x="46" y="28" width="8" height="58" rx="4" fill="${c.m}"/><path d="M38 14a12 12 0 1024 0l-6 0v8h-12v-8z" fill="${c.m}"/><circle cx="50" cy="80" r="2" fill="${c.a}"/></g>`,
  headlamp: (c) => `${shadow(c, 30)}<path d="M18 30h50c10 0 16 8 16 20s-6 20-16 20H18z" fill="${c.k}"/><circle cx="66" cy="50" r="13" fill="${c.a}"/><circle cx="66" cy="50" r="6" fill="${c.l}"/><rect x="24" y="40" width="26" height="20" rx="3" fill="${c.m}" opacity=".8"/>`,
  basket: (c) => `<circle cx="36" cy="40" r="11" fill="${c.a}"/><circle cx="56" cy="34" r="12" fill="${c.m}"/><circle cx="68" cy="46" r="9" fill="#E3B23C"/><path d="M58 22c4-4 8-4 10-2" stroke="#4E8A3A" stroke-width="2.6" fill="none"/>${shadow(c, 34)}<path d="M16 46h68l-8 38H24z" fill="#B7834C"/><path d="M20 58h60M22 70h56M30 46l4 38M42 46l2 38M58 46l-2 38M70 46l-4 38" stroke="#8C5E30" stroke-width="1.6"/>`,
  eggs: (c) => `${shadow(c, 36)}<rect x="14" y="40" width="72" height="40" rx="5" fill="${c.m}"/>${Array.from({ length: 8 }, (_, i) => `<ellipse cx="${23 + (i % 4) * 18}" cy="${i < 4 ? 46 : 64}" rx="7" ry="9" fill="#F5E9D6"/>`).join("")}`,
  yam: (c) => `${shadow(c, 34)}<path d="M14 66c4-12 24-20 44-20 16 0 28 6 28 14 0 10-16 16-36 16-20 0-38-2-36-10z" fill="${c.m}"/><path d="M24 40c6-8 22-12 36-10 10 2 16 6 14 12-2 6-16 8-30 8-14 0-24-4-20-10z" fill="${c.m}" opacity=".8"/><path d="M30 62l4 2M44 58l3 3M58 62l4 1M70 58l3 2" stroke="${c.k}" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>`,
  sack: (c) => `${shadow(c, 26)}<path d="M34 22c4 4 28 4 32 0l2 6c8 10 10 26 8 40-2 12-10 16-26 16s-24-4-26-16c-2-14 0-30 8-40z" fill="${c.m}"/><path d="M34 22h32" stroke="${c.k}" stroke-width="3" stroke-linecap="round"/><rect x="36" y="48" width="28" height="18" rx="2" fill="${c.l}" opacity=".85"/><rect x="40" y="54" width="20" height="2.6" rx="1" fill="${c.a}"/>`,
  leaf: (c) => `${shadow(c, 26)}<path d="M50 84V40" stroke="#3E6B2E" stroke-width="3"/><path d="M50 60C30 60 20 44 22 24c18 0 28 14 28 36z" fill="${c.m}"/><path d="M50 52c20 0 30-14 28-32-18 0-28 12-28 32z" fill="${c.m}" opacity=".8"/><path d="M50 60L30 32M50 52l20-26" stroke="${c.l}" stroke-width="1.4" opacity=".5"/>`,
  pot: (c) => `${shadow(c, 32)}<rect x="40" y="22" width="20" height="6" rx="3" fill="${c.k}"/><path d="M22 34h56c0 26-8 46-28 46S22 60 22 34z" fill="${c.m}"/><rect x="20" y="30" width="60" height="8" rx="4" fill="${c.a}"/><path d="M14 42h8M78 42h8" stroke="${c.k}" stroke-width="4" stroke-linecap="round"/>`,
};

function colours(p: DemoPalette): C {
  return { m: p.main, a: p.accent, k: p.ink, l: "#FFFFFF" };
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** One object on its own background, square: product photos and category tiles. */
export function demoProductSvg(kind: DemoArtKind, palette: DemoPalette) {
  const c = colours(palette);
  const draw = MOTIFS[kind] ?? MOTIFS.bag;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="600" height="600"><rect width="100" height="100" fill="${palette.bg}"/><circle cx="78" cy="20" r="26" fill="${palette.accent}" opacity=".08"/><g transform="translate(14 14) scale(.72)">${draw(c)}</g></svg>`;
}

export function demoProductArt(kind: DemoArtKind, palette: DemoPalette) {
  return svgDataUri(demoProductSvg(kind, palette));
}

/**
 * A banner scene: several objects on a soft, patterned field, with a small "Sample" mark so nobody mistakes it
 * for a real photo. `ratio` is width / height (16/9 for heroes, 4/5 for stories).
 */
export function demoSceneSvg(kinds: DemoArtKind[], palette: DemoPalette & { field: string; mains: string[] }, ratio = 16 / 9) {
  const h = 100;
  const w = Math.round(h * ratio);
  const c = colours(palette);
  const items = kinds.slice(0, 3);
  const size = Math.min(h * 0.78, (w * 0.9) / Math.max(items.length, 1));
  const gap = (w - size * items.length) / (items.length + 1);
  const objects = items
    .map((kind, i) => {
      const x = gap + i * (size + gap);
      const y = (h - size) / 2 + (i % 2 ? 6 : -2);
      const draw = MOTIFS[kind] ?? MOTIFS.bag;
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size / 100).toFixed(3)})">${draw({ ...c, m: palette.mains[i % palette.mains.length] ?? c.m })}</g>`;
    })
    .join("");
  const pattern = `<pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="${palette.ink}" opacity=".08"/></pattern>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 16}" height="${h * 16}" preserveAspectRatio="xMidYMid slice"><defs>${pattern}</defs><rect width="${w}" height="${h}" fill="${palette.field}"/><rect width="${w}" height="${h}" fill="url(#p)"/><circle cx="${(w * 0.18).toFixed(1)}" cy="18" r="34" fill="${palette.accent}" opacity=".12"/><circle cx="${(w * 0.86).toFixed(1)}" cy="88" r="40" fill="${palette.main}" opacity=".10"/>${objects}<text x="${w - 3}" y="${h - 3}" text-anchor="end" font-family="system-ui, sans-serif" font-size="3.2" fill="${palette.ink}" opacity=".45">Sample</text></svg>`;
}

export function demoSceneArt(kinds: DemoArtKind[], palette: DemoPalette & { field: string; mains: string[] }, ratio = 16 / 9) {
  return svgDataUri(demoSceneSvg(kinds, palette, ratio));
}
