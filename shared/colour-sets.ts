// Colour sets from the seller's own logo and product photos (onboarding D2b "Here are 3 colour sets for you", and the
// phone editor's theme sheet). The server shrinks each picture (sharp) and hands its pixels here:
//   1. dominantColours: k-means in plain TS on the small picture, biggest clusters first;
//   2. accentFrom: the strongest real colour among them (near-white, near-black and greys are skipped: they're
//      backgrounds and shadows, not a brand colour);
//   3. colourSet: a full set around that accent (page, words, button, button words, soft card) that passes WCAG:
//      words on the page and on the button ≥ 4.5:1, the button against the page ≥ 3:1 (a control, WCAG 1.4.11).
// Then three labelled sets: "From your logo", "From your photos" and "Rex's pick for this style" (a preset), with the
// presets filling in when there are no pictures (or nothing colourful in them).
// Pure, no imports: tests/colour-sets.test.mjs loads it with Node's type stripping.

export type Rgb = [number, number, number];

export interface ColourSet {
  /** Page background. */
  bg: string;
  /** Words on the page (≥ 4.5:1 on bg). */
  ink: string;
  /** Buttons and highlights (≥ 3:1 against bg). */
  accent: string;
  /** Words on the button (≥ 4.5:1 on accent). */
  accentInk: string;
  /** Cards and soft panels (ink stays ≥ 4.5:1 on it too). */
  soft: string;
  /** Secondary words (≥ 4.5:1 on bg). */
  muted: string;
}

export type ColourSource = "logo" | "photos" | "rex";

export interface LabelledColourSet {
  /** Saved as the onboarding palette id ("logo", "photos", or the preset's id for Rex's pick). */
  id: string;
  source: ColourSource;
  set: ColourSet;
  /** Four dots on the card: accent, soft, bg, ink (as the presets' swatches). */
  swatch: [string, string, string, string];
  /** Theme tokens (the same keys as the presets' tokens). */
  tokens: Record<string, string>;
}

// ─── Colour maths ────────────────────────────────────────────────────────────

const clamp = (value: number, min = 0, max = 255) => Math.min(max, Math.max(min, value));

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1]!.length === 3 ? match[1]!.split("").map((c) => c + c).join("") : match[1]!;
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((value) => Math.round(clamp(value)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** WCAG 2 relative luminance (0 black … 1 white). */
export function luminance(colour: string | Rgb): number {
  const rgb = typeof colour === "string" ? hexToRgb(colour) : colour;
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((value) => {
    const c = clamp(value) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two colours (1 … 21). */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const TEXT_CONTRAST = 4.5;
export const CONTROL_CONTRAST = 3;

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255];
}

/** Whites, near-blacks and greys: backgrounds and shadows, not a brand colour. */
export function isNeutral(rgb: Rgb): boolean {
  const [, s, l] = rgbToHsl(rgb);
  if (l > 0.93 || l < 0.08) return true;
  // Greys: little colour (a dark colour needs a bit more to count).
  return s < (l < 0.2 ? 0.28 : 0.18);
}

// ─── Dominant colours (k-means) ──────────────────────────────────────────────

const distance2 = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The main colours of a picture's pixels (RGB; transparent ones already left out), biggest first, each with its
 * share of the pixels. Deterministic: k-means++ style seeding by "farthest from the chosen ones", then a few rounds.
 */
export function dominantColours(pixels: readonly Rgb[], k = 6, rounds = 10): Array<{ hex: string; rgb: Rgb; share: number }> {
  if (!pixels.length) return [];
  // At most ~4,000 pixels: evenly spaced (pictures arrive already shrunk; this is a safety net).
  const step = Math.max(1, Math.floor(pixels.length / 4000));
  const sample: Rgb[] = [];
  for (let i = 0; i < pixels.length; i += step) sample.push(pixels[i]!);
  const count = Math.max(1, Math.min(k, sample.length));
  // Seeds: the average pixel's nearest, then each time the pixel farthest from every seed so far.
  const mean: Rgb = [0, 1, 2].map((c) => sample.reduce((sum, px) => sum + px[c]!, 0) / sample.length) as Rgb;
  const centres: Rgb[] = [sample.reduce((best, px) => (distance2(px, mean) < distance2(best, mean) ? px : best), sample[0]!)];
  while (centres.length < count) {
    let far = sample[0]!;
    let farDist = -1;
    for (const px of sample) {
      const near = Math.min(...centres.map((centre) => distance2(px, centre)));
      if (near > farDist) {
        farDist = near;
        far = px;
      }
    }
    if (farDist <= 0) break;
    centres.push([...far] as Rgb);
  }
  let labels = new Array<number>(sample.length).fill(0);
  for (let round = 0; round < rounds; round += 1) {
    let moved = false;
    labels = sample.map((px, index) => {
      let best = 0;
      for (let c = 1; c < centres.length; c += 1) if (distance2(px, centres[c]!) < distance2(px, centres[best]!)) best = c;
      if (best !== labels[index]) moved = true;
      return best;
    });
    for (let c = 0; c < centres.length; c += 1) {
      const members = sample.filter((_, index) => labels[index] === c);
      if (members.length) centres[c] = [0, 1, 2].map((ch) => members.reduce((sum, px) => sum + px[ch]!, 0) / members.length) as Rgb;
    }
    if (!moved && round > 0) break;
  }
  const sizes = centres.map((_, c) => labels.filter((label) => label === c).length);
  return centres
    .map((rgb, c) => ({ rgb: rgb.map(Math.round) as Rgb, hex: rgbToHex(rgb), share: sizes[c]! / sample.length }))
    .filter((entry) => entry.share > 0)
    .sort((a, b) => b.share - a.share);
}

/**
 * The picture's brand colour: among its main colours that aren't neutral (and cover at least 3% of it), the one
 * with the most colour weighted by how much of the picture it covers. Null when it's all whites, blacks and greys.
 */
export function accentFrom(colours: ReadonlyArray<{ rgb: Rgb; share: number }>): string | null {
  let best: { rgb: Rgb; score: number } | null = null;
  for (const colour of colours) {
    if (colour.share < 0.03 || isNeutral(colour.rgb)) continue;
    const [, s, l] = rgbToHsl(colour.rgb);
    // Vivid, mid-light colours win; a big share helps but doesn't swamp a strong small logo mark.
    const score = s * (1 - Math.abs(l - 0.5)) * Math.sqrt(colour.share);
    if (!best || score > best.score) best = { rgb: colour.rgb, score };
  }
  return best ? rgbToHex(best.rgb) : null;
}

// ─── A full, accessible set from one accent ──────────────────────────────────

/** The colour moved lighter or darker (same hue and colour) until it has `ratio` against `against`. */
export function adjustForContrast(colour: string, against: string, ratio: number): string {
  if (contrastRatio(colour, against) >= ratio) return colour.toUpperCase();
  const rgb = hexToRgb(colour);
  if (!rgb) return colour;
  const [h, s, l] = rgbToHsl(rgb);
  const darker = luminance(against) > 0.18;
  for (let step = 1; step <= 100; step += 1) {
    const next = darker ? l - (l * step) / 100 : l + ((1 - l) * step) / 100;
    const hex = rgbToHex(hslToRgb(h, s, Math.max(0, Math.min(1, next))));
    if (contrastRatio(hex, against) >= ratio) return hex;
  }
  return darker ? "#000000" : "#FFFFFF";
}

/** White or near-black words on a colour: whichever reads better (always ≥ 4.5:1 once the accent is adjusted). */
export function readableOn(colour: string, dark = "#16141F"): string {
  return contrastRatio("#FFFFFF", colour) >= contrastRatio(dark, colour) ? "#FFFFFF" : dark;
}

function tint(colour: string, toward: string, amount: number): string {
  const a = hexToRgb(colour)!;
  const b = hexToRgb(toward)!;
  return rgbToHex([0, 1, 2].map((c) => a[c]! + (b[c]! - a[c]!) * amount) as Rgb);
}

/**
 * A full colour set around an accent: a light page (or a dark one for `dark` styles such as luxury) faintly tinted
 * with the accent, ink of the same hue, the accent itself adjusted until the button stands out (≥ 3:1) and its words
 * read (≥ 4.5:1), and a soft card colour. Every pair is checked; see setProblems.
 */
export function colourSet(accentHex: string, options: { dark?: boolean } = {}): ColourSet {
  const rgb = hexToRgb(accentHex) ?? [255, 106, 43];
  const [h, s] = rgbToHsl(rgb);
  const dark = Boolean(options.dark);
  const bg = rgbToHex(hslToRgb(h, Math.min(s, 0.35), dark ? 0.08 : 0.975));
  const ink = rgbToHex(hslToRgb(h, Math.min(s, 0.45), dark ? 0.94 : 0.12));
  const accent = rgbToHex(rgb);
  const soft = tint(bg, accent, dark ? 0.14 : 0.1);
  return accessibleSet({ bg, ink, accent, accentInk: readableOn(accent), soft, muted: tint(ink, bg, 0.35) });
}

/**
 * The set with every pair brought up to WCAG, changing as little as it can: words darker (or lighter on a dark
 * page), the button colour moved until it stands out from the page and its words read. Used for the sets made from
 * pictures and for Rex's presets, whose bright buttons don't always pass with white words.
 */
export function accessibleSet(input: ColourSet): ColourSet {
  const bg = input.bg.toUpperCase();
  const soft = input.soft.toUpperCase();
  let ink = adjustForContrast(input.ink, bg, TEXT_CONTRAST + 0.5);
  if (contrastRatio(ink, soft) < TEXT_CONTRAST) ink = adjustForContrast(ink, soft, TEXT_CONTRAST + 0.2);
  let accent = adjustForContrast(input.accent, bg, CONTROL_CONTRAST);
  let accentInk = readableOn(accent);
  // A mid colour can miss 4.5:1 with both white and dark words: move it toward darker (white words) or lighter
  // (dark words) until one reads; that also moves it further from the page.
  for (let step = 0; step < 50 && contrastRatio(accentInk, accent) < TEXT_CONTRAST; step += 1) {
    const [ah, as, al] = rgbToHsl(hexToRgb(accent)!);
    const lighter = accentInk !== "#FFFFFF";
    accent = rgbToHex(hslToRgb(ah, as, lighter ? Math.min(1, al + 0.02) : Math.max(0, al - 0.02)));
    accentInk = readableOn(accent);
  }
  let muted = adjustForContrast(input.muted, bg, TEXT_CONTRAST);
  if (contrastRatio(muted, soft) < TEXT_CONTRAST) muted = adjustForContrast(muted, soft, TEXT_CONTRAST);
  if (contrastRatio(muted, bg) < TEXT_CONTRAST) muted = ink;
  return { bg, ink, accent, accentInk, soft, muted };
}

/** The pairs that fall short of WCAG in a set (empty: it passes). */
export function setProblems(set: ColourSet): string[] {
  const problems: string[] = [];
  if (contrastRatio(set.ink, set.bg) < TEXT_CONTRAST) problems.push("ink/bg");
  if (contrastRatio(set.ink, set.soft) < TEXT_CONTRAST) problems.push("ink/soft");
  if (contrastRatio(set.muted, set.bg) < TEXT_CONTRAST) problems.push("muted/bg");
  if (contrastRatio(set.accentInk, set.accent) < TEXT_CONTRAST) problems.push("accentInk/accent");
  if (contrastRatio(set.accent, set.bg) < CONTROL_CONTRAST) problems.push("accent/bg");
  return problems;
}

/** The theme tokens for a set (the keys the onboarding presets and the editor's themes use). */
export function setTokens(set: ColourSet): Record<string, string> {
  return {
    accent: set.accent,
    ctaBg: set.accent,
    ctaText: set.accentInk,
    paperBg: set.bg,
    cardBg: set.soft,
    ink: set.ink,
    muted: set.muted,
    border: tint(set.bg, set.ink, 0.12),
    heroBg: set.soft,
    heroText: set.ink,
  };
}

/** A preset palette's tokens read back as a set (for Rex's pick, and to check presets). */
export function setFromTokens(tokens: Record<string, string>): ColourSet {
  return {
    bg: tokens.paperBg ?? "#FFFFFF",
    ink: tokens.ink ?? "#16141F",
    accent: tokens.ctaBg ?? tokens.accent ?? "#FF6A2B",
    accentInk: tokens.ctaText ?? "#FFFFFF",
    soft: tokens.cardBg ?? tokens.paperBg ?? "#FFFFFF",
    muted: tokens.muted ?? tokens.ink ?? "#16141F",
  };
}

const swatchOf = (set: ColourSet): [string, string, string, string] => [set.accent, set.soft, set.bg, set.ink];

export interface PresetLike {
  id: string;
  tokens: Record<string, string>;
}

/**
 * The three sets for D2b: from the logo, from the product photos (when it's a different colour from the logo's) and
 * Rex's pick for the style (its first preset); presets fill any gap so there are always three. `dark` styles
 * (luxury) get dark pages.
 */
export function colourSetsFor(input: { logoAccent?: string | null; photoAccent?: string | null; presets: readonly PresetLike[]; dark?: boolean }): LabelledColourSet[] {
  const out: LabelledColourSet[] = [];
  const add = (id: string, source: ColourSource, set: ColourSet, tokens = setTokens(set)) => out.push({ id, source, set, swatch: swatchOf(set), tokens });
  if (input.logoAccent && hexToRgb(input.logoAccent)) add("logo", "logo", colourSet(input.logoAccent, { dark: input.dark }));
  const tooClose = (hex: string) => out.some((entry) => distance2(hexToRgb(entry.set.accent)!, hexToRgb(hex)!) < 40 ** 2);
  if (input.photoAccent && hexToRgb(input.photoAccent) && !tooClose(input.photoAccent)) add("photos", "photos", colourSet(input.photoAccent, { dark: input.dark }));
  for (const preset of input.presets) {
    if (out.length >= 3) break;
    if (out.some((entry) => entry.id === preset.id)) continue;
    const set = accessibleSet(setFromTokens(preset.tokens));
    add(preset.id, "rex", set, { ...preset.tokens, ...setTokens(set), border: preset.tokens.border ?? setTokens(set).border, heroBg: preset.tokens.heroBg && contrastRatio(preset.tokens.heroText ?? set.ink, preset.tokens.heroBg) >= TEXT_CONTRAST ? preset.tokens.heroBg : set.soft, heroText: preset.tokens.heroBg && contrastRatio(preset.tokens.heroText ?? set.ink, preset.tokens.heroBg) >= TEXT_CONTRAST ? preset.tokens.heroText ?? set.ink : set.ink });
  }
  return out.slice(0, 3);
}

/** Only #RRGGBB values for the token keys a set has (what the server accepts back from the phone). */
export const SET_TOKEN_KEYS = ["accent", "ctaBg", "ctaText", "paperBg", "cardBg", "ink", "muted", "border", "heroBg", "heroText"] as const;

export function cleanSetTokens(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const key of SET_TOKEN_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null;
    out[key] = value.toUpperCase();
  }
  return setProblems(setFromTokens(out)).length ? null : out;
}
