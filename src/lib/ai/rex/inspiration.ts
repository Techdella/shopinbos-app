// Inspiration a seller gives Rex before a full store build: links to stores they like, screenshots, a ready-made
// theme and a note in their own words. This module reads what matters from a store's web page (name, words,
// menu, colours, fonts, picture) and turns it all into lines for Rex's design prompt. Pure (no imports with side
// effects), unit-tested in tests/rex-full-build.test.mjs. The fetch lives in inspiration.server.ts.

import { z } from "zod";

export interface InspirationLink {
  url: string;
  host: string;
  title: string;
  description: string;
  headings: string[];
  menu: string[];
  colours: string[];
  fonts: string[];
  /** The page's share picture (og:image), when it has a public https one. */
  imageUrl: string | null;
}

export interface Inspiration {
  links: InspirationLink[];
  /** Screenshots the seller uploaded (the store's own media URLs). */
  screenshots: string[];
  /** A theme from the library the seller picked as the starting point. */
  themeId: string | null;
  note: string;
}

/** At most this many pictures go to the model (screenshots first, then the links' share pictures). */
export const MAX_INSPIRATION_IMAGES = 4;
export const MAX_INSPIRATION_LINKS = 3;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'", rsquo: "'", lsquo: "'", ldquo: "\"", rdquo: "\"", ndash: "-", mdash: "-" };

function decode(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z#0-9]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

/** Visible text of an HTML fragment, on one line. */
function textOf(fragment: string) {
  return decode(fragment.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function metaContent(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (name !== key) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content?.trim()) return decode(content).trim();
  }
  return "";
}

function unique(list: string[], max: number, maxLength: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = raw.trim().slice(0, maxLength);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function normaliseHex(hex: string) {
  const value = hex.toLowerCase();
  return value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value.slice(0, 7);
}

/** The page's most used colours, plain white, black and greys left out (they say nothing about the brand). */
function brandColours(html: string, themeColour: string) {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = normaliseHex(match[0]);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (Math.max(r, g, b) - Math.min(r, g, b) < 16) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const theme = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(themeColour) ? [normaliseHex(themeColour)] : [];
  return unique([...theme, ...ranked], 6, 7);
}

function fontNames(html: string) {
  const names: string[] = [];
  for (const match of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const family of decode(match[1]).matchAll(/family=([^&:;]+)/g)) names.push(decodeURIComponent(family[1].replace(/\+/g, " ")));
  }
  for (const match of html.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) {
    const first = match[1].split(",")[0]?.replace(/["']/g, "").trim();
    if (first && !/^(inherit|initial|var\(|sans-serif|serif|monospace|system-ui|-apple-system)/i.test(first)) names.push(first);
  }
  return unique(names, 4, 40);
}

/** What Rex can use from a store's page. `url` is the address the page was fetched from. */
export function parseInspirationHtml(html: string, url: string): InspirationLink {
  const page = html.slice(0, 1_500_000);
  const body = page.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const title = metaContent(page, "og:site_name") || metaContent(page, "og:title") || textOf(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page)?.[1] ?? "");
  const description = metaContent(page, "og:description") || metaContent(page, "description");
  const headings = unique([...body.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => textOf(match[1])), 8, 120);
  const navHtml = [...body.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)].map((match) => match[0]).join(" ") || (/<header\b[\s\S]*?<\/header>/i.exec(body)?.[0] ?? "");
  const menu = unique([...navHtml.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => textOf(match[1])).filter((label) => label.length <= 30), 10, 30);
  const rawImage = metaContent(page, "og:image") || metaContent(page, "twitter:image");
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, url);
      if (resolved.protocol === "https:") imageUrl = resolved.toString().slice(0, 2000);
    } catch {
      imageUrl = null;
    }
  }
  return {
    url: url.slice(0, 2000),
    host,
    title: title.slice(0, 120),
    description: description.slice(0, 300),
    headings,
    menu,
    colours: brandColours(page, metaContent(page, "theme-color")),
    fonts: fontNames(page),
    imageUrl,
  };
}

/** True when a page gave Rex nothing to go on (a login wall, an app shell). */
export function isEmptyInspiration(link: InspirationLink) {
  return !link.description && !link.headings.length && !link.menu.length && !link.colours.length && !link.imageUrl;
}

/** The pictures the model sees: screenshots first, then the links' share pictures. */
export function inspirationImages(inspiration: Inspiration | null | undefined) {
  if (!inspiration) return [];
  const urls = [...inspiration.screenshots, ...inspiration.links.map((link) => link.imageUrl ?? "")].filter((url) => /^https:\/\//.test(url));
  return [...new Set(urls)].slice(0, MAX_INSPIRATION_IMAGES);
}

export function hasInspiration(inspiration: Inspiration | null | undefined) {
  return Boolean(inspiration && (inspiration.links.length || inspiration.screenshots.length || inspiration.themeId || inspiration.note.trim()));
}

/** Lines for Rex's prompt. The seller's examples set the feel; Rex never copies them. */
export function inspirationPrompt(inspiration: Inspiration | null | undefined, themeName?: string | null) {
  if (!hasInspiration(inspiration)) return "";
  const lines: string[] = [];
  if (inspiration!.note.trim()) lines.push(`In the seller's words: ${inspiration!.note.trim().slice(0, 1200)}`);
  if (inspiration!.themeId) lines.push(`They picked the ready-made theme ${themeName ? `"${themeName}"` : `"${inspiration!.themeId}"`} (id "${inspiration!.themeId}") to start from: keep its layout.`);
  for (const link of inspiration!.links) {
    const parts = [
      `A store they like: ${link.host || link.url}`,
      link.title ? `name "${link.title}"` : "",
      link.description ? `says "${link.description}"` : "",
      link.headings.length ? `headings: ${link.headings.map((heading) => `"${heading}"`).join(", ")}` : "",
      link.menu.length ? `menu: ${link.menu.join(", ")}` : "",
      link.colours.length ? `colours: ${link.colours.join(", ")}` : "",
      link.fonts.length ? `fonts: ${link.fonts.join(", ")}` : "",
    ].filter(Boolean);
    lines.push(parts.join("; "));
  }
  const pictures = inspirationImages(inspiration).length;
  if (pictures) lines.push(`${pictures} picture${pictures === 1 ? "" : "s"} of stores they like ${pictures === 1 ? "is" : "are"} attached: study the layout, colour mood, type and how products are shown.`);
  return `\n\nINSPIRATION from the seller (use it):\n${lines.map((line) => `- ${line}`).join("\n")}\n\nTake the feel from it: colour mood, type, tone of voice, how bold or calm it is, how products are shown, what the menu offers. Make it the seller's own store: never copy another store's name, logo, words, products, prices or pictures.`;
}

const https = z.string().trim().max(2000).regex(/^https:\/\/\S+$/);
const words = (max: number) => z.string().trim().max(max).catch("");
const list = (max: number, length: number) => z.array(z.string()).max(40).catch([]).transform((items) => items.map((item) => item.trim().slice(0, length)).filter(Boolean).slice(0, max));

/** Inspiration as the browser sends it back to the build steps (the link summaries came from our own reader). */
export const InspirationSchema = z.object({
  links: z
    .array(
      z.object({
        url: z.string().trim().max(2000),
        host: words(120),
        title: words(120),
        description: words(300),
        headings: list(8, 120),
        menu: list(10, 30),
        colours: list(6, 7).transform((items) => items.filter((item) => /^#[0-9a-f]{6}$/i.test(item))),
        fonts: list(4, 40),
        imageUrl: https.nullable().catch(null),
      }),
    )
    .max(MAX_INSPIRATION_LINKS)
    .catch([]),
  screenshots: z.array(https).max(MAX_INSPIRATION_IMAGES).catch([]),
  themeId: z.string().trim().max(40).nullable().catch(null),
  note: words(1200),
});
