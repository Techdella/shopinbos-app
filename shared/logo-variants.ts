// Logos that stay legible on dark headers and footers. A store has its main logo (Store.logoUrl, drawn for light
// backgrounds) and, in brandSettings.logoVariants, what was learned about it when it was saved: a version for
// dark backgrounds (made automatically, or the seller's own) and how the picture is built (transparent or on its
// own background, one ink colour or several, dark or light ink). Nothing is guessed at render time: the
// storefront reads the saved facts, works out whether the bar behind the logo is dark (relative luminance of
// its resolved colour) and picks the variant or a CSS treatment. Pure; no imports, so tests load it directly.

// ─── Colours ─────────────────────────────────────────────────────────────────

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  transparent: "#00000000",
  navy: "#000080",
  gray: "#808080",
  grey: "#808080",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
};

function channel(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return (Number.parseFloat(trimmed) / 100) * max;
  return Number.parseFloat(trimmed);
}

/** Parses #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (comma or space syntax) and a few names. Null otherwise. */
export function parseColour(input: unknown): Rgba | null {
  if (typeof input !== "string") return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (NAMED[value]) value = NAMED[value]!;
  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) digits = digits.split("").map((d) => d + d).join("");
    if (digits.length !== 6 && digits.length !== 8) return null;
    const n = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(value);
  if (fn) {
    const parts = fn[1]!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map((part) => channel(part, 255));
    const a = parts[3] !== undefined ? channel(parts[3], 1) : 1;
    if ([r, g, b, a].some((n) => !Number.isFinite(n))) return null;
    const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));
    return { r: clamp(r!, 255), g: clamp(g!, 255), b: clamp(b!, 255), a: clamp(a, 1) };
  }
  return null;
}

/** WCAG relative luminance of an opaque colour (0 = black, 1 = white). */
export function relativeLuminance(colour: Pick<Rgba, "r" | "g" | "b">) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(colour.r) + 0.7152 * lin(colour.g) + 0.0722 * lin(colour.b);
}

/**
 * Below this luminance white text has more contrast than black text (the crossover of the two WCAG contrast
 * ratios), so the colour counts as dark.
 */
export const DARK_LUMINANCE = 0.179;

/**
 * Whether a background colour is dark. See-through colours (a header at 94% opacity) are blended over `under`
 * (the page behind, white by default). Anything unreadable (a gradient, a CSS variable) gives `fallback`.
 */
export function isDarkBackground(colour: unknown, options: { fallback?: boolean; under?: unknown } = {}): boolean {
  const parsed = parseColour(colour);
  if (!parsed) return options.fallback ?? false;
  let { r, g, b } = parsed;
  if (parsed.a < 1) {
    const base = parseColour(options.under) ?? { r: 255, g: 255, b: 255, a: 1 };
    r = r * parsed.a + base.r * (1 - parsed.a);
    g = g * parsed.a + base.g * (1 - parsed.a);
    b = b * parsed.a + base.b * (1 - parsed.a);
  }
  return relativeLuminance({ r, g, b }) < DARK_LUMINANCE;
}

function toHex({ r, g, b }: Pick<Rgba, "r" | "g" | "b">) {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

// ─── What a logo picture is made of (measured when it is saved) ──────────────

export interface LogoAnalysis {
  /** transparent: the mark floats on nothing; plain: one flat colour behind it; complex: a photo or pattern. */
  background: "transparent" | "plain" | "complex";
  /** The flat background colour (plain only). */
  backgroundColour: string | null;
  /** One ink colour (a single-colour mark or wordmark). */
  mono: boolean;
  /** Whether the mark itself is dark or light; null when there is no readable mark. */
  ink: "dark" | "light" | null;
  /** The ink colour (mono only). */
  inkColour: string | null;
}

const distance = (a: Pick<Rgba, "r" | "g" | "b">, b: Pick<Rgba, "r" | "g" | "b">) => Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);

/**
 * Measures a logo from its RGBA pixels (row by row, 4 bytes each; a small copy, e.g. 128×128, is plenty).
 * The outer ring of pixels tells the background; the pixels that differ clearly from it are the ink.
 */
export function analyseLogoPixels(pixels: ArrayLike<number>, width: number, height: number): LogoAnalysis {
  const at = (x: number, y: number): Rgba => {
    const i = (y * width + x) * 4;
    return { r: pixels[i]!, g: pixels[i + 1]!, b: pixels[i + 2]!, a: pixels[i + 3]! / 255 };
  };
  const border: Rgba[] = [];
  for (let x = 0; x < width; x++) border.push(at(x, 0), at(x, height - 1));
  for (let y = 1; y < height - 1; y++) border.push(at(0, y), at(width - 1, y));

  const clear = border.filter((p) => p.a < 0.1).length;
  let background: LogoAnalysis["background"] = "complex";
  let bg: Rgba | null = null;
  if (clear / border.length >= 0.9) background = "transparent";
  else {
    const solid = border.filter((p) => p.a > 0.9);
    const channelMedian = (key: "r" | "g" | "b") => {
      const sorted = solid.map((p) => p[key]).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? 0;
    };
    const median = { r: channelMedian("r"), g: channelMedian("g"), b: channelMedian("b"), a: 1 };
    if (solid.length / border.length >= 0.9 && solid.filter((p) => distance(p, median) < 30).length / border.length >= 0.9) {
      background = "plain";
      bg = median;
    }
  }

  // Core ink: clearly part of the mark (solid, and far from a flat background). Edges blend, so they're skipped.
  const ink: Rgba[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = at(x, y);
      if (background === "transparent" ? p.a > 0.75 : p.a > 0.9 && (!bg || distance(p, bg) > 110)) ink.push(p);
    }
  }
  const empty: LogoAnalysis = { background, backgroundColour: bg ? toHex(bg) : null, mono: false, ink: null, inkColour: null };
  if (background === "complex" || ink.length < Math.max(4, width * height * 0.002)) return empty;

  const mean = ink.reduce((sum, p) => ({ r: sum.r + p.r / ink.length, g: sum.g + p.g / ink.length, b: sum.b + p.b / ink.length }), { r: 0, g: 0, b: 0 });
  const mono = ink.filter((p) => distance(p, mean) < 70).length / ink.length >= 0.92;
  const luminance = ink.reduce((sum, p) => sum + relativeLuminance(p), 0) / ink.length;
  return { ...empty, mono, ink: luminance < DARK_LUMINANCE * 1.6 ? "dark" : "light", inkColour: mono ? toHex(mean) : null };
}

// ─── SVG logos: the dark-background version is the same drawing re-inked ─────

/** The ink used for marks on dark backgrounds. */
export const LIGHT_INK = "#FFFFFF";

const COLOUR_TOKEN = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)|\b(?:black|navy)\b/g;

function recolourValue(value: string, light: string) {
  return value.replace(COLOUR_TOKEN, (token) => {
    const colour = parseColour(token);
    if (!colour || colour.a === 0) return token;
    return relativeLuminance(colour) < DARK_LUMINANCE * 1.6 ? light : token;
  });
}

/**
 * The dark-background version of an SVG logo: every dark fill, stroke and gradient stop becomes the light ink
 * (lighter colours, such as an accent, stay). Shapes with no colour of their own are black by default, so the
 * root gets the light ink as its fill and colour (currentColor). Scripts and event handlers are dropped.
 */
export function recolourSvgForDark(svg: string, light = LIGHT_INK): string {
  let out = svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  // Attributes: fill, stroke, stop-color, color.
  out = out.replace(/\b(fill|stroke|stop-color|color|flood-color)\s*=\s*("([^"]*)"|'([^']*)')/gi, (_match, name: string, _quoted, dq: string | undefined, sq: string | undefined) => {
    const value = dq ?? sq ?? "";
    return `${name}="${recolourValue(value, light)}"`;
  });
  // Inline styles and <style> blocks.
  out = out.replace(/(style\s*=\s*")([^"]*)(")/gi, (_m, start: string, body: string, end: string) => `${start}${recolourValue(body, light)}${end}`);
  out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, start: string, body: string, end: string) => `${start}${recolourValue(body, light)}${end}`);
  // Default black: the root's own fill/colour are inherited by unpainted shapes.
  out = out.replace(/<svg\b([^>]*)>/i, (match, attrs: string) => {
    let next = attrs;
    if (!/\sfill\s*=/.test(next)) next += ` fill="${light}"`;
    if (!/\scolor\s*=/.test(next)) next += ` color="${light}"`;
    return next === attrs ? match : `<svg${next}>`;
  });
  return out;
}

/** Whether a url or content type is an SVG picture. */
export function isSvgLogo(url: string | null | undefined, contentType?: string | null) {
  if (contentType && /image\/svg/i.test(contentType)) return true;
  return typeof url === "string" && /\.svg(?:[?#]|$)/i.test(url);
}

// ─── The saved facts (brandSettings.logoVariants) ───────────────────────────

export interface LogoVariantsRecord {
  /** The Store.logoUrl these facts are about; when the logo changes they no longer apply. */
  for: string;
  /** The logo for dark backgrounds, or null. */
  onDark: string | null;
  /** "auto": made from the logo when it was saved; "seller": uploaded or chosen by the seller. */
  source: "auto" | "seller";
  analysis: LogoAnalysis | null;
}

const HTTPS = /^https:\/\/\S+$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readAnalysis(value: unknown): LogoAnalysis | null {
  const raw = record(value);
  if (!raw) return null;
  const background = raw.background === "transparent" || raw.background === "plain" || raw.background === "complex" ? raw.background : null;
  if (!background) return null;
  return {
    background,
    backgroundColour: typeof raw.backgroundColour === "string" ? raw.backgroundColour : null,
    mono: raw.mono === true,
    ink: raw.ink === "dark" || raw.ink === "light" ? raw.ink : null,
    inkColour: typeof raw.inkColour === "string" ? raw.inkColour : null,
  };
}

/** brandSettings.logoVariants as saved, or null when missing or malformed. */
export function readLogoVariantsRecord(brandSettings: unknown): LogoVariantsRecord | null {
  const raw = record(record(brandSettings)?.logoVariants);
  if (!raw || typeof raw.for !== "string") return null;
  const onDark = typeof raw.onDark === "string" && HTTPS.test(raw.onDark.trim()) ? raw.onDark.trim() : null;
  return { for: raw.for, onDark, source: raw.source === "seller" ? "seller" : "auto", analysis: readAnalysis(raw.analysis) };
}

/** The store's logos: the main one (light backgrounds) and what applies on dark backgrounds. */
export interface StoreLogo {
  light: string | null;
  dark: string | null;
  /** Whether `dark` is the seller's own choice (else made automatically, or none). */
  darkFromSeller: boolean;
  analysis: LogoAnalysis | null;
}

export function readStoreLogo(store: { logoUrl?: string | null; brandSettings?: unknown }): StoreLogo {
  const light = typeof store.logoUrl === "string" && store.logoUrl.trim() ? store.logoUrl.trim() : null;
  const saved = readLogoVariantsRecord(store.brandSettings);
  // Facts about an older logo don't apply to this one.
  const current = saved && light && saved.for === light ? saved : null;
  return { light, dark: current?.onDark ?? null, darkFromSeller: current?.source === "seller" && Boolean(current.onDark), analysis: current?.analysis ?? null };
}

// ─── Choosing what to show ───────────────────────────────────────────────────

/**
 * none: the picture as is. to-light / to-dark: a one-colour mark re-inked white or black with a CSS filter.
 * light-chip / dark-chip: the picture on a small light (or dark) tile, for multi-colour marks with no variant.
 */
export type LogoTreatment = "none" | "to-light" | "to-dark" | "light-chip" | "dark-chip";

export interface LogoChoice {
  src: string;
  treatment: LogoTreatment;
}

/** Which logo picture to show on a dark or light background, and how. Null when the store has no logo. */
export function chooseLogo(logo: StoreLogo, backgroundDark: boolean): LogoChoice | null {
  if (!logo.light) return logo.dark && backgroundDark ? { src: logo.dark, treatment: "none" } : null;
  const a = logo.analysis;
  if (backgroundDark) {
    if (logo.dark) return { src: logo.dark, treatment: "none" };
    // Pictures with their own background read on anything.
    if (a && a.background !== "transparent") return { src: logo.light, treatment: "none" };
    if (a?.ink === "light") return { src: logo.light, treatment: "none" };
    if (a?.mono && a.ink === "dark") return { src: logo.light, treatment: "to-light" };
    // Several colours on nothing (or never measured): a light tile keeps it legible.
    return { src: logo.light, treatment: "light-chip" };
  }
  if (a?.background === "transparent" && a.ink === "light") {
    return { src: logo.light, treatment: a.mono ? "to-dark" : "dark-chip" };
  }
  return { src: logo.light, treatment: "none" };
}

/** Inline style for a treatment (plain object so both React and tests can use it). */
export function logoTreatmentStyle(treatment: LogoTreatment): Record<string, string | number> {
  switch (treatment) {
    case "to-light":
      return { filter: "brightness(0) invert(1)" };
    case "to-dark":
      return { filter: "brightness(0)" };
    case "light-chip":
      return { background: "#FFFFFF", padding: 3, borderRadius: 8, boxSizing: "border-box" };
    case "dark-chip":
      return { background: "#16141F", padding: 3, borderRadius: 8, boxSizing: "border-box" };
    default:
      return {};
  }
}

/**
 * The dark-background version of a one-colour logo on a flat background (raster): the background becomes
 * see-through and the mark the light ink, with the soft edges kept as partial transparency. Returns new RGBA
 * pixels of the same size.
 */
export function knockOutForDark(pixels: ArrayLike<number>, background: string, ink: string, light = LIGHT_INK): Uint8ClampedArray {
  const bg = parseColour(background) ?? { r: 255, g: 255, b: 255, a: 1 };
  const mark = parseColour(ink) ?? { r: 0, g: 0, b: 0, a: 1 };
  const out = parseColour(light) ?? { r: 255, g: 255, b: 255, a: 1 };
  const span = Math.max(1, distance(mark, bg));
  const result = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const p = { r: pixels[i]!, g: pixels[i + 1]!, b: pixels[i + 2]! };
    const strength = Math.min(1, Math.max(0, distance(p, bg) / span));
    result[i] = out.r;
    result[i + 1] = out.g;
    result[i + 2] = out.b;
    result[i + 3] = Math.round(strength * pixels[i + 3]!);
  }
  return result;
}

/** How much of a pixel's colour is colour rather than grey (0–255). */
const chroma = (p: Pick<Rgba, "r" | "g" | "b">) => Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b);

/** A near-black, near-grey pixel: the wordmark ink of most generated logos, as opposed to a coloured accent. */
function darkNeutral(p: Pick<Rgba, "r" | "g" | "b">) {
  return chroma(p) < 48 && relativeLuminance(p) < DARK_LUMINANCE;
}

/**
 * Whether a see-through logo has enough dark neutral ink (black or grey lettering) to be worth re-inking for dark
 * backgrounds, e.g. a black wordmark with a red accent. Counts solid pixels only.
 */
export function hasDarkNeutralInk(pixels: ArrayLike<number>): boolean {
  let solid = 0;
  let dark = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3]! < 191) continue;
    solid++;
    if (darkNeutral({ r: pixels[i]!, g: pixels[i + 1]!, b: pixels[i + 2]! })) dark++;
  }
  return solid > 0 && dark / solid >= 0.2;
}

/**
 * The dark-background version of a see-through logo with dark lettering and coloured accents: the dark neutral
 * ink (soft edges included, by their own transparency) becomes the light ink and every coloured part stays as it
 * is. Returns new RGBA pixels of the same size.
 */
export function relightDarkInk(pixels: ArrayLike<number>, light = LIGHT_INK): Uint8ClampedArray {
  const out = parseColour(light) ?? { r: 255, g: 255, b: 255, a: 1 };
  const result = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const p = { r: pixels[i]!, g: pixels[i + 1]!, b: pixels[i + 2]! };
    const swap = pixels[i + 3]! > 0 && darkNeutral(p);
    result[i] = swap ? out.r : p.r;
    result[i + 1] = swap ? out.g : p.g;
    result[i + 2] = swap ? out.b : p.b;
    result[i + 3] = pixels[i + 3]!;
  }
  return result;
}
