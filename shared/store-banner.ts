// The shop's banner (the homepage hero) and announcement bar, as the phone's Edit my shop builds them
// (apps/mobile/src/components/seller/BannerEditor.tsx) and the storefronts draw them
// (src/components/storefront/boutique, TemplateStorefrontSurface.tsx). Pure and import-free, so the server routes
// (src/app/api/mobile/banner), the phone and tests/mobile-banner.test.mjs all load it.
//
// Where things are kept in the draft design (brandSettings.editor.draft, changed with PATCH /api/store/editor):
//   hero-split   copy block   { title, body, primaryCta }                    heading, text, button label
//                settings     { primaryButtonAction, primaryButtonTarget }   where the button goes
//   announcement copy block   { text }                                       the message
//                settings     { linkAction, linkTarget, barColor }           optional link, colour
//                visible      false hides the bar

// ─── Where a button or the bar goes ──────────────────────────────────────────

/** The shop, one collection, one product, or a WhatsApp chat with the shop. */
export const BANNER_LINK_ACTIONS = ["products", "collection", "product", "whatsapp"] as const;
export type BannerLinkAction = (typeof BANNER_LINK_ACTIONS)[number];

export interface BannerLink {
  action: BannerLinkAction;
  /** The collection or product id ("" for the shop and WhatsApp). */
  target: string;
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isAction = (value: unknown): value is BannerLinkAction => (BANNER_LINK_ACTIONS as readonly string[]).includes(str(value));

function linkOf(action: unknown, target: unknown): BannerLink | null {
  if (!isAction(action)) return null;
  const id = str(target);
  // A collection or product link without its id goes to the shop.
  if ((action === "collection" || action === "product") && !id) return { action: "products", target: "" };
  return { action, target: action === "collection" || action === "product" ? id : "" };
}

/**
 * The banner button's link. Pages the web builder sets ("about", "contact", "faq"…) are not ours to show on the
 * phone: they read as null so the phone leaves them alone unless the seller picks something else.
 */
export function readHeroLink(settings: Record<string, unknown> | null | undefined): BannerLink | null {
  const action = settings?.primaryButtonAction;
  if (action === undefined || action === null || action === "") return { action: "products", target: "" };
  return linkOf(action, settings?.primaryButtonTarget);
}

/** The hero settings for a link, merged over what the section has (update-section replaces settings whole). */
export function heroLinkSettings(settings: Record<string, unknown> | null | undefined, link: BannerLink): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(settings ?? {}), primaryButtonAction: link.action };
  if (link.action === "collection" || link.action === "product") next.primaryButtonTarget = link.target;
  else delete next.primaryButtonTarget;
  return next;
}

/** The announcement bar's optional link (null: the bar is plain text). */
export function readBarLink(settings: Record<string, unknown> | null | undefined): BannerLink | null {
  return linkOf(settings?.linkAction, settings?.linkTarget);
}

/** A hex colour the seller picked for the bar, or null for the theme's own. */
export function readBarColor(settings: Record<string, unknown> | null | undefined): string | null {
  const value = str(settings?.barColor);
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null;
}

export function barSettings(settings: Record<string, unknown> | null | undefined, patch: { link?: BannerLink | null; color?: string | null }): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(settings ?? {}) };
  if (patch.link !== undefined) {
    if (patch.link) {
      next.linkAction = patch.link.action;
      if (patch.link.target) next.linkTarget = patch.link.target;
      else delete next.linkTarget;
    } else {
      delete next.linkAction;
      delete next.linkTarget;
    }
  }
  if (patch.color !== undefined) {
    const color = patch.color ? readBarColor({ barColor: patch.color }) : null;
    if (color) next.barColor = color;
    else delete next.barColor;
  }
  return next;
}

/** White or near-black text, whichever reads better on `hex` (WCAG relative luminance). */
export function readableText(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#FFFFFF";
  const value = parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? "#16141F" : "#FFFFFF";
}

/**
 * Where a link goes on the live store, given how the store builds its addresses. null when it can't go anywhere yet
 * (WhatsApp without a number). `page(key, params)` is the store's page address; `product(id)` a product's page.
 */
export function bannerLinkHref(
  link: BannerLink,
  store: { page: (key: string, params?: URLSearchParams) => string; product: (id: string) => string; whatsapp: string | null; name: string },
): string | null {
  if (link.action === "product" && link.target) return store.product(link.target);
  if (link.action === "collection" && link.target) return store.page("products", new URLSearchParams({ collection: link.target }));
  if (link.action === "whatsapp") return store.whatsapp ? `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(`Hi ${store.name}, I'd like to order`)}` : null;
  return store.page("products");
}

// ─── Rex builds the banner ───────────────────────────────────────────────────

/** "Build it with Rex" quick picks: the chip (translated on the phone, m_banner "vibe.<id>") and what Rex reads. */
export const BANNER_VIBES = [
  { id: "bold", brief: "bold and bright: strong colour, confident, high energy" },
  { id: "soft", brief: "soft and calm: gentle daylight, airy, elegant" },
  { id: "luxury", brief: "luxury: rich dark tones, gold accents, premium and polished" },
  { id: "festive", brief: "festive: celebration, owambe colours, joyful" },
  { id: "fresh", brief: "fresh and natural: greenery, morning light, clean" },
  { id: "street", brief: "street style: urban city energy, modern, youthful" },
] as const;
export type BannerVibe = (typeof BANNER_VIBES)[number]["id"];

export const isBannerVibe = (value: unknown): value is BannerVibe => BANNER_VIBES.some((vibe) => vibe.id === value);

/** As long as the phone's fields allow (and the web builder shows well). */
export const BANNER_LIMITS = { heading: 120, text: 240, button: 40, tagline: 120, announcement: 140 } as const;

export interface BannerCopy {
  heading: string;
  text: string;
  button: string;
}

const clip = (value: unknown, max: number) => str(value).replace(/^["“'‘]+|["”'’]+$/g, "").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** The banner words Rex wrote, cleaned: up to three, each with a heading (the rest may be empty). */
export function parseBannerCopy(raw: unknown): BannerCopy[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { options?: unknown }).options) ? (raw as { options: unknown[] }).options : [];
  const out: BannerCopy[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const heading = clip(row.heading ?? row.title, BANNER_LIMITS.heading);
    if (!heading || out.some((option) => option.heading.toLowerCase() === heading.toLowerCase())) continue;
    out.push({ heading, text: clip(row.text ?? row.body, BANNER_LIMITS.text), button: clip(row.button ?? row.cta, BANNER_LIMITS.button) });
    if (out.length === 3) break;
  }
  return out;
}

/** Three taglines from the writer's answer (a JSON array, or one per line), cleaned and without repeats. */
export function parseTaglines(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { taglines?: unknown }).taglines)
      ? (raw as { taglines: unknown[] }).taglines
      : typeof raw === "string"
        ? raw.split("\n").map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""))
        : [];
  const out: string[] = [];
  for (const entry of list) {
    const line = clip(entry, BANNER_LIMITS.tagline);
    if (line && !out.some((seen) => seen.toLowerCase() === line.toLowerCase())) out.push(line);
    if (out.length === 3) break;
  }
  return out;
}

export interface BannerBrief {
  storeName: string;
  business: string | null;
  category: string | null;
  audience: string | null;
  vibe: BannerVibe | null;
  /** What the seller typed. */
  prompt: string;
  /** The English name of the language to write in, e.g. "Yoruba". */
  language: string;
}

function facts(brief: BannerBrief) {
  return [
    `Shop: ${brief.storeName}`,
    brief.business ? `What they sell: ${brief.business}` : "",
    brief.category ? `Category: ${brief.category}` : "",
    brief.audience ? `Customers: ${brief.audience}` : "",
    brief.vibe ? `Feel: ${BANNER_VIBES.find((vibe) => vibe.id === brief.vibe)?.brief}` : "",
    brief.prompt ? `The seller asked for: ${brief.prompt}` : "",
  ].filter(Boolean).join("\n");
}

/** The picture: a wide homepage banner photo with room for words, and never any words in it. */
export function bannerImagePrompt(brief: BannerBrief) {
  return [
    "A wide homepage banner photograph for an African online shop. Landscape, editorial, high quality, shot like a real campaign.",
    facts(brief),
    "Show the kind of products or lifestyle the shop sells. Leave calm space on one side for a heading.",
    "No words, letters, logos, watermarks or price tags anywhere in the picture.",
  ].join("\n");
}

export const BANNER_COPY_SYSTEM = `You are Rex, the store designer for Shopinbos sellers (African online shops). You write homepage banner words.
Answer with JSON only: {"options":[{"heading":"…","text":"…","button":"…"}, …]} with exactly three options that feel different from each other.
heading: at most 8 words. text: one sentence, at most 20 words. button: 1 to 3 words (like "Shop now").
Use the shop's real details. Never invent prices, discounts, awards, delivery times or ingredients. No emojis, no hashtags, no quotes.
Do not mention AI, Rex, Peggy or Shopinbos.`;

export function bannerCopyPrompt(brief: BannerBrief) {
  return `Write the banner in ${brief.language}.\n${facts(brief)}`;
}

export const TAGLINE_SYSTEM = `You are Peggy, a friendly shop assistant for Shopinbos sellers (African online shops). You write shop taglines.
Answer with JSON only: {"taglines":["…","…","…"]}: exactly three short taglines, each at most 8 words, each a different angle.
Match the shop's tone. Use its real details. Never invent prices, discounts, awards or delivery times. No emojis, no hashtags, no quotes.
Do not mention AI, Rex, Peggy or Shopinbos.`;

export function taglinePrompt(input: { storeName: string; business: string | null; audience: string | null; tone: string | null; current: string; language: string }) {
  return [
    `Write the taglines in ${input.language}.`,
    `Shop: ${input.storeName}`,
    input.business ? `What they sell: ${input.business}` : "",
    input.audience ? `Customers: ${input.audience}` : "",
    input.tone ? `Tone: ${input.tone}` : "",
    input.current ? `Current tagline (write new ones): ${input.current}` : "",
  ].filter(Boolean).join("\n");
}
