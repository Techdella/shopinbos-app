// The visual email builder's blocks turned into simple, email-safe HTML: inline styles only, tables where a
// layout must hold in Outlook, and "fluid hybrid" columns (inline-block divs, with Outlook-only ghost tables) that
// sit side by side on a computer and stack on a phone without media queries. No scripts, no SVG, no web fonts:
// countdowns are static, and the spin wheel / scratch card / gift graphics are drawn with table cells and CSS
// borders. An optional "theme" block picks a style family (Minimal, Bold, Editorial, Playful, Luxury dark,
// Market, Receipt) that sets the card colours and fonts; the brand kit's accent and logo always apply.
// The blocks ride along in an HTML comment at the top of the body, so the builder can reopen what it wrote;
// HTML pasted by hand has no comment and opens in the HTML editor instead. Pure.

export type Align = "left" | "center" | "right";

/** Optional look for any block. Colours are #hex; anything else is dropped when a block is read back. */
export interface BlockStyle {
  align?: Align;
  /** Text colour (heading, text, footer) or button colour. */
  color?: string;
  /** Background behind the block (drawn as a rounded panel). */
  bg?: string;
  /** Space above and below the block, in px (0-48). */
  pad?: number;
}

export interface ColumnCell {
  imageUrl?: string;
  alt?: string;
  heading?: string;
  text?: string;
  buttonLabel?: string;
  buttonUrl?: string;
}

export interface ProductItem {
  name: string;
  /** Shown as written ("₦12,500"). */
  price: string;
  imageUrl: string;
  url: string;
  /** Old price, struck through ("₦18,000"). */
  was?: string;
  /** A small tag over the name ("-30%", "Bestseller"). */
  badge?: string;
}

export interface CountdownUnit {
  value: string;
  label: string;
}

export interface ReceiptLine {
  name: string;
  /** "× 2", "Size 40". */
  detail?: string;
  amount: string;
}

export interface ReceiptTotal {
  label: string;
  amount: string;
}

export interface FeatureItem {
  /** One or two characters drawn in a circle ("✓", "₦", "01"). */
  icon?: string;
  title: string;
  text?: string;
}

export const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok", "x", "whatsapp", "youtube", "website"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export const SOCIAL_LABELS: Record<SocialNetwork, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", x: "X", whatsapp: "WhatsApp", youtube: "YouTube", website: "Website" };

// ─── Style families ──────────────────────────────────────────────────────────

export const EMAIL_THEMES = ["classic", "minimal", "bold", "editorial", "playful", "luxe", "market", "receipt"] as const;
export type EmailThemeName = (typeof EMAIL_THEMES)[number];

export interface ThemePalette {
  label: string;
  /** One line for the style picker. */
  sub: string;
  /** The white card the email sits on. */
  card: string;
  /** Text colour, or null for the brand kit's. */
  ink: string | null;
  /** Page behind the card, or null for the brand kit's. */
  page: string | null;
  muted: string;
  line: string;
  /** Soft panels (reviews, footers, features). */
  soft: string;
  /** Social link pills. */
  pill: string;
  /** Behind product photos while they load. */
  imgBg: string;
  /** Behind a discount code. */
  coupon: string;
  /** Dark boxes (countdown, banners). */
  deep: string;
  /** Heading style added after the size ("" keeps the classic look). */
  head: string;
  /** Font for the whole email. */
  body: string;
  radius: number;
  /** Divider line style. */
  rule: "solid" | "dashed";
  logoAlign: "left" | "center";
  dark: boolean;
  /** Prices in the brand colour (deal-heavy layouts). */
  loudPrices: boolean;
}

const SANS = "Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";
const MONO = "'Courier New',Courier,monospace";
const BASE = { ink: null, page: null, muted: "#7A7686", line: "#E6E1F0", soft: "#F6F4FA", pill: "#F1EFF5", imgBg: "#F4F2F7", coupon: "#FFF7F0", deep: "#16141F", head: "", body: SANS, radius: 14, rule: "solid", logoAlign: "left", dark: false, loudPrices: false } as const;

export const EMAIL_THEME_INFO: Record<EmailThemeName, ThemePalette> = {
  classic: { ...BASE, label: "Classic", sub: "Clean white card, friendly and clear", card: "#FFFFFF" },
  minimal: { ...BASE, label: "Minimal", sub: "Lots of white space, quiet type", card: "#FFFFFF", page: "#FFFFFF", line: "#ECECEC", soft: "#F7F7F5", pill: "#F2F2F0", radius: 4, head: ";font-weight:600;letter-spacing:-0.3px" },
  bold: { ...BASE, label: "Bold", sub: "Big heavy headlines that shout the offer", card: "#FFFFFF", head: ";font-family:'Arial Black','Helvetica Neue',Arial,sans-serif;font-weight:900;letter-spacing:-0.8px;text-transform:uppercase", radius: 10 },
  editorial: { ...BASE, label: "Editorial", sub: "Magazine feel: serif headlines on warm paper", card: "#FBF8F2", line: "#DDD3C1", soft: "#F3ECDF", pill: "#EFE6D6", imgBg: "#EFE6D6", coupon: "#F6EFE2", head: `;font-family:${SERIF};font-weight:400;letter-spacing:-0.4px`, rule: "solid", logoAlign: "center" },
  playful: { ...BASE, label: "Playful", sub: "Round, warm and fun for treats and games", card: "#FFFFFF", page: "#FFF1E3", soft: "#FFF4E8", pill: "#FFEBD6", coupon: "#FFF4E8", head: ";font-family:'Trebuchet MS','Segoe UI',Arial,sans-serif;font-weight:800;letter-spacing:-0.3px", radius: 22, logoAlign: "center" },
  luxe: { ...BASE, label: "Luxury dark", sub: "Black and gold for VIPs and premium pieces", card: "#131116", ink: "#F3EDE3", page: "#08070A", muted: "#A39C90", line: "#2E2A33", soft: "#1E1B22", pill: "#26222B", imgBg: "#1E1B22", coupon: "#1E1B22", deep: "#26222B", head: `;font-family:${SERIF};font-weight:400;letter-spacing:0.2px`, logoAlign: "center", dark: true },
  market: { ...BASE, label: "Market", sub: "Dense deals, loud prices, Temu-style energy", card: "#FFFFFF", page: "#FFEDE6", line: "#FFD9CB", soft: "#FFF3EE", pill: "#FFE9E0", coupon: "#FFF3EE", deep: "#1D1A22", head: ";font-weight:900;letter-spacing:-0.6px", radius: 10, loudPrices: true },
  receipt: { ...BASE, label: "Receipt", sub: "Typewriter details for orders and deliveries", card: "#FFFFFF", page: "#ECEBE8", line: "#D8D5CF", soft: "#F6F5F2", pill: "#F0EFEC", head: `;font-family:${MONO};font-weight:700;letter-spacing:-0.2px`, radius: 6, rule: "dashed" },
};

export function themePalette(theme: string | null | undefined): ThemePalette {
  return EMAIL_THEME_INFO[(EMAIL_THEMES as readonly string[]).includes(theme ?? "") ? (theme as EmailThemeName) : "classic"];
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

export type HeroLayout = "full" | "split" | "type";
export type GameKind = "spin" | "scratch" | "gift" | "draw";

export type EmailBlock = (
  | { type: "heading"; text: string; size?: "lg" | "md" | "sm" }
  | { type: "text"; text: string }
  | { type: "button"; label: string; url: string; textColor?: string; variant?: "solid" | "outline" | "wide" }
  | { type: "image"; url: string; alt: string; link?: string }
  | { type: "divider"; variant?: "line" | "dashed" | "dots" | "accent" }
  | { type: "spacer"; height: number }
  | { type: "columns"; cells: ColumnCell[] }
  | { type: "products"; items: ProductItem[]; buttonLabel?: string; columns?: 1 | 2 | 3 }
  | { type: "coupon"; code: string; title: string; note: string; variant?: "dashed" | "ticket" | "bold"; value?: string }
  | { type: "social"; links: Array<{ network: SocialNetwork; url: string }> }
  | { type: "footer"; text: string; unsubscribe?: boolean; variant?: "simple" | "panel" }
  | { type: "theme"; theme: EmailThemeName }
  | { type: "hero"; layout: HeroLayout; imageUrl: string; alt: string; eyebrow: string; heading: string; text: string; buttonLabel: string; buttonUrl: string }
  | { type: "banner"; text: string; variant?: "accent" | "dark" | "soft" }
  | { type: "countdown"; variant?: "boxes" | "pill" | "bar"; title: string; units: CountdownUnit[]; note: string }
  | { type: "receipt"; title: string; lines: ReceiptLine[]; totals: ReceiptTotal[]; note: string }
  | { type: "steps"; steps: string[]; current: number; note: string }
  | { type: "review"; quote: string; author: string; rating: number; detail: string }
  | { type: "features"; items: FeatureItem[] }
  | { type: "vip"; tier: string; title: string; text: string; perks: string[]; buttonLabel: string; buttonUrl: string }
  | { type: "meter"; title: string; current: number; goal: number; unit: string; from: string; to: string; note: string }
  | { type: "game"; game: GameKind; title: string; text: string; prizes: string[]; value: string; buttonLabel: string; buttonUrl: string }
) &
  BlockStyle;

export type EmailBlockType = EmailBlock["type"];

export const BLOCK_LABELS: Record<EmailBlockType, string> = {
  heading: "Heading",
  text: "Text",
  button: "Button",
  image: "Image",
  divider: "Line",
  spacer: "Space",
  columns: "Two columns",
  products: "Products",
  coupon: "Discount code",
  social: "Social links",
  footer: "Footer",
  theme: "Email style",
  hero: "Hero",
  banner: "Notice bar",
  countdown: "Countdown",
  receipt: "Order summary",
  steps: "Delivery steps",
  review: "Review",
  features: "Highlights",
  vip: "VIP card",
  meter: "Points meter",
  game: "Game",
};

export const GAME_LABELS: Record<GameKind, string> = { spin: "Spin the wheel", scratch: "Scratch to reveal", gift: "Mystery gift", draw: "Lucky draw ticket" };

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => ESC[ch]);
const MARK = "sib-blocks:";
const PRE_MARK = "sib-pre:";
/** Ends the part of the body drawn edge to edge at the top of the card (a full-bleed hero). */
export const BLEED_MARK = "<!--sib-bleed-->";
const THEME_MARK = "sib-theme:";

/** A #hex colour, or "" for anything else (so nothing can break out of a style attribute). */
export function safeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : "";
}

/**
 * Link targets a button or image may use: https/http, mailto, tel, a {{variable}} link, or the shop or cart
 * link with a path or query after it ("{{store_url}}?play=spin").
 */
export function safeUrl(url: string) {
  const trimmed = (url ?? "").trim();
  if (/^{{\s*[a-z_]+\s*}}$/.test(trimmed)) return trimmed;
  if (/^{{\s*(?:store_url|cart_url)\s*}}[/?#][^\s<>"'{}]*$/.test(trimmed)) return trimmed;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed) && !/[\s<>"]/.test(trimmed)) return trimmed;
  return "";
}

/** An image source: an https/http link only (a {{variable}} can't be an image). */
function imageUrl(url: string | undefined) {
  const safe = safeUrl(url ?? "");
  return safe && /^https?:\/\//i.test(safe) ? safe : "";
}

/**
 * Inline formatting inside text: **bold**, *italic*, [label](https://link) and line breaks. Everything
 * else is escaped; links go through safeUrl, so a javascript: link stays plain text.
 */
export function inline(text: string) {
  const parts: string[] = [];
  const link = /\[([^\]\n]{1,200})\]\(([^)\s]{1,1000})\)/g;
  let last = 0;
  for (let match = link.exec(text); match; match = link.exec(text)) {
    parts.push(esc(text.slice(last, match.index)));
    const url = safeUrl(match[2]);
    parts.push(url ? `<a href="${esc(url)}" style="color:{{brand_accent}};font-weight:700">${esc(match[1])}</a>` : esc(match[0]));
    last = match.index + match[0].length;
  }
  parts.push(esc(text.slice(last)));
  return parts
    .join("")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?![*\w])/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}

const ALIGNS: Align[] = ["left", "center", "right"];
const pad = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(48, Math.round(value))) : undefined);
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const EYEBROW = `font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase`;

function textStyle(block: BlockStyle) {
  const color = safeColor(block.color);
  return `${block.align && ALIGNS.includes(block.align) ? `;text-align:${block.align}` : ""}${color ? `;color:${color}` : ""}`;
}

/** Wraps a block's HTML in its background panel / padding when it has one. */
function frame(block: BlockStyle, html: string, p: ThemePalette = EMAIL_THEME_INFO.classic) {
  const bg = safeColor(block.bg);
  const space = pad(block.pad);
  if (!bg && space === undefined) return html;
  const inner = bg ? `padding:${space ?? 18}px 20px;background:${bg};border-radius:${p.radius}px` : `padding:${space}px 0`;
  return `<div style="margin:0 0 16px;${inner}">${html}</div>`;
}

function button(label: string, url: string, color = "", textColor = "", small = false, variant: "solid" | "outline" | "wide" = "solid") {
  const href = safeUrl(url);
  if (!href) return "";
  const size = small ? "padding:9px 16px;font-size:14px" : "padding:13px 22px";
  const fill = safeColor(color) || "{{brand_accent}}";
  if (variant === "outline") return `<a href="${esc(href)}" style="display:inline-block;background:transparent;color:${safeColor(textColor) || fill};border:2px solid ${fill};${size};border-radius:999px;text-decoration:none;font-weight:700">${esc(label || "Shop now")}</a>`;
  if (variant === "wide") return `<a href="${esc(href)}" style="display:block;background:${fill};color:${safeColor(textColor) || "#ffffff"};padding:15px 22px;border-radius:999px;text-decoration:none;font-weight:800;text-align:center;font-size:17px">${esc(label || "Shop now")}</a>`;
  return `<a href="${esc(href)}" style="display:inline-block;background:${fill};color:${safeColor(textColor) || "#ffffff"};${size};border-radius:999px;text-decoration:none;font-weight:700">${esc(label || "Shop now")}</a>`;
}

/**
 * Inline-block cells: side by side when there's room, stacked on a phone (where clients that read the shell's
 * media query widen them to the full width). Outlook on Windows ignores max-width, so it gets a ghost table
 * that holds the columns instead.
 */
function fluidRow(cells: string[], max = 272, opts: { center?: boolean; fixed?: boolean } = {}) {
  const width = opts.fixed ? `width:${(100 / cells.length).toFixed(2)}%` : "width:100%";
  const ghost = (html: string, i: number) => `${i === 0 ? `<!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="${max}" valign="top"><![endif]-->` : `<!--[if mso]></td><td width="${max}" valign="top"><![endif]-->`}${html}`;
  return `<div style="font-size:0;line-height:0;margin:0 -6px 6px;text-align:${opts.center ? "center" : "left"}">${cells
    .map((cell, i) => ghost(`<div${opts.fixed ? "" : ' class="sib-col"'} style="display:inline-block;${width};max-width:${max}px;vertical-align:top;box-sizing:border-box;padding:0 6px 14px;font-size:16px;line-height:1.55${opts.center ? ";text-align:center" : ""}">${cell}</div>`, i))
    .join("")}<!--[if mso]></td></tr></table><![endif]--></div>`;
}

function cellHtml(cell: ColumnCell) {
  const img = imageUrl(cell.imageUrl);
  return [
    img ? `<img src="${esc(img)}" alt="${esc(cell.alt ?? "")}" width="260" style="display:block;width:100%;max-width:100%;height:auto;border-radius:12px;border:0;margin:0 0 10px" />` : "",
    cell.heading ? `<p style="margin:0 0 6px;font-size:17px;font-weight:700;line-height:1.3">${inline(cell.heading)}</p>` : "",
    cell.text ? `<p style="margin:0 0 10px;font-size:15px">${inline(cell.text)}</p>` : "",
    cell.buttonLabel && cell.buttonUrl ? `<p style="margin:0">${button(cell.buttonLabel, cell.buttonUrl, "", "", true)}</p>` : "",
  ].join("");
}

function priceHtml(item: ProductItem, p: ThemePalette, size = 15) {
  if (!item.price) return "";
  const loud = p.loudPrices ? ";color:{{brand_accent}};font-weight:800;opacity:1" : ";opacity:0.75";
  const was = item.was ? ` <span style="text-decoration:line-through;font-weight:400;opacity:0.55;font-size:${size - 2}px">${esc(item.was)}</span>` : "";
  return `<p style="margin:0 0 10px;font-size:${size}px${loud}">${esc(item.price)}${was}</p>`;
}

function badgeHtml(item: ProductItem) {
  return item.badge ? `<p style="margin:0 0 6px"><span style="display:inline-block;padding:3px 8px;border-radius:6px;background:{{brand_accent}};color:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase">${esc(item.badge)}</span></p>` : "";
}

function productHtml(item: ProductItem, label: string, p: ThemePalette = EMAIL_THEME_INFO.classic, compact = false) {
  const img = imageUrl(item.imageUrl);
  const url = safeUrl(item.url);
  const picture = img ? `<img src="${esc(img)}" alt="${esc(item.name)}" width="260" style="display:block;width:100%;max-width:100%;height:auto;border-radius:${compact ? 10 : 12}px;border:0;margin:0 0 10px;background:${p.imgBg}" />` : "";
  // The classic two-up card keeps exactly the markup it always had.
  if (!compact && !item.badge && !item.was && !p.loudPrices) {
    return [
      url && picture ? `<a href="${esc(url)}" style="text-decoration:none">${picture}</a>` : picture,
      `<p style="margin:0 0 2px;font-size:15px;font-weight:700;line-height:1.35">${esc(item.name)}</p>`,
      item.price ? `<p style="margin:0 0 10px;font-size:15px;opacity:0.75">${esc(item.price)}</p>` : "",
      url ? `<p style="margin:0">${button(label, url, "", "", true)}</p>` : "",
    ].join("");
  }
  return [
    url && picture ? `<a href="${esc(url)}" style="text-decoration:none">${picture}</a>` : picture,
    badgeHtml(item),
    `<p style="margin:0 0 2px;font-size:${compact ? 13 : 15}px;font-weight:700;line-height:1.3">${esc(item.name)}</p>`,
    priceHtml(item, p, compact ? 14 : 15),
    url && !compact ? `<p style="margin:0">${button(label, url, "", "", true)}</p>` : "",
    url && compact ? `<p style="margin:0"><a href="${esc(url)}" style="font-size:13px;font-weight:800;color:{{brand_accent}};text-decoration:none">${esc(label || "Shop")} &rarr;</a></p>` : "",
  ].join("");
}

function featureProduct(item: ProductItem, label: string, p: ThemePalette, bg: boolean) {
  const img = imageUrl(item.imageUrl);
  const url = safeUrl(item.url);
  const picture = img ? `<img src="${esc(img)}" alt="${esc(item.name)}" width="260" style="display:block;width:100%;max-width:100%;height:auto;border-radius:${p.radius}px;border:0;background:${p.imgBg}" />` : "";
  const details = [
    badgeHtml(item),
    `<p style="margin:0 0 6px;font-size:22px;font-weight:700;line-height:1.25${p.head}">${esc(item.name)}</p>`,
    priceHtml(item, p, 18),
    url ? `<p style="margin:0">${button(label, url)}</p>` : "",
  ].join("");
  return fluidRow([url && picture ? `<a href="${esc(url)}" style="text-decoration:none">${picture}</a>` : picture, `<div style="padding:8px 0 0">${details}</div>`], bg ? 256 : 272);
}

function stars(rating: number) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return `<span style="color:#F2A93B">${"★".repeat(n)}</span><span style="color:#D9D4CC">${"★".repeat(5 - n)}</span>`;
}

function heroHtml(block: Extract<EmailBlock, { type: "hero" }>, p: ThemePalette, first: boolean) {
  const img = imageUrl(block.imageUrl);
  const href = safeUrl(block.buttonUrl);
  const bg = safeColor(block.bg);
  const color = safeColor(block.color);
  const align = block.align && ALIGNS.includes(block.align) ? block.align : block.layout === "split" ? "left" : "center";
  const eyebrow = block.eyebrow.trim() ? `<p style="margin:0 0 10px;${EYEBROW};color:${color || "{{brand_accent}}"}">${esc(block.eyebrow.trim())}</p>` : "";
  const size = block.layout === "type" ? 44 : block.layout === "split" ? 28 : 32;
  const heading = block.heading.trim() ? `<h1 style="margin:0 0 12px;font-size:${size}px;line-height:${block.layout === "type" ? 1.02 : 1.12};letter-spacing:${block.layout === "type" ? "-1.5px" : "-0.6px"};font-weight:800${p.head}${color ? `;color:${color}` : ""}">${inline(block.heading)}</h1>` : "";
  const text = block.text.trim() ? block.text.split(/\n{2,}/).map((para) => `<p style="margin:0 0 14px;font-size:${block.layout === "type" ? 18 : 16}px${color ? `;color:${color}` : ""}">${inline(para)}</p>`).join("") : "";
  const cta = block.buttonLabel.trim() && href ? `<p style="margin:18px 0 6px">${button(block.buttonLabel, href)}</p>` : "";
  const words = `${eyebrow}${heading}${text}${cta}`;
  const picture = (radius: string) => {
    if (!img) return "";
    const tag = `<img src="${esc(img)}" alt="${esc(block.alt)}" width="600" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:${radius}" />`;
    return href ? `<a href="${esc(href)}">${tag}</a>` : tag;
  };

  if (block.layout === "type") {
    const panel = bg ? `padding:36px 26px;background:${bg};border-radius:${p.radius + 4}px` : "padding:14px 0 4px";
    return `<div style="margin:0 0 20px;${panel};text-align:${align}">${words}</div>`;
  }
  if (block.layout === "split") {
    const inner = fluidRow([picture(`${p.radius}px`), `<div style="padding:6px 4px 0;text-align:${align}">${words}</div>`], bg ? 256 : 272);
    return bg ? `<div style="margin:0 0 18px;padding:20px 20px 6px;background:${bg};border-radius:${p.radius + 4}px">${inner}</div>` : `<div style="margin:0 0 6px">${inner}</div>`;
  }
  // Full: as the first block it runs edge to edge across the top of the card.
  if (first) {
    return `<div${bg ? ` style="background:${bg}"` : ""}>${picture("0")}<div style="padding:28px 28px 10px;text-align:${align}">${words}</div></div>\n${BLEED_MARK}`;
  }
  return `<div style="margin:0 0 18px;${bg ? `background:${bg};border-radius:${p.radius + 4}px;padding:0 0 6px` : ""}">${picture(bg ? `${p.radius + 4}px ${p.radius + 4}px 0 0` : `${p.radius}px`)}<div style="padding:${bg ? "22px 22px 4px" : "20px 0 0"};text-align:${align}">${words}</div></div>`;
}

function countdownHtml(block: Extract<EmailBlock, { type: "countdown" }>, p: ThemePalette) {
  const units = block.units.filter((u) => u.value.trim()).slice(0, 4);
  const box = safeColor(block.bg) || p.deep;
  const ink = safeColor(block.color) || "#ffffff";
  const note = block.note.trim() ? `<p style="margin:10px 0 0;font-size:13.5px;text-align:center;opacity:0.8">${inline(block.note)}</p>` : "";
  if (block.variant === "pill") {
    const time = units.map((u) => `${u.value} ${u.label}`.trim()).join(" ");
    return `<p style="margin:0 0 18px;text-align:${block.align ?? "center"}"><span style="display:inline-block;padding:9px 18px;border-radius:999px;background:${safeColor(block.bg) || "{{brand_accent}}"};color:${ink};font-size:13px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">&#9679; ${esc(block.title)}${time ? ` ${esc(time)}` : ""}</span></p>`;
  }
  if (block.variant === "bar") {
    const time = units.map((u) => `${esc(u.value)}<span style="font-size:11px;opacity:0.7">${esc(u.label.slice(0, 1))}</span>`).join(" : ");
    return `<table ${TABLE} width="100%" style="margin:0 0 18px"><tr><td bgcolor="${box}" style="padding:14px 18px;border-radius:${p.radius}px;background:${box};color:${ink}"><table ${TABLE} width="100%"><tr><td style="font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${ink}">${esc(block.title)}</td><td align="right" style="font-family:${MONO};font-size:20px;font-weight:700;color:{{brand_accent}};white-space:nowrap">${time}</td></tr></table></td></tr></table>${note}`;
  }
  const cells = units
    .map((u) => `<td style="padding:0 4px"><div style="min-width:58px;padding:12px 8px 10px;border-radius:12px;background:${box};color:${ink};text-align:center"><span style="display:block;font-family:${MONO};font-size:30px;font-weight:700;line-height:1">${esc(u.value)}</span><span style="display:block;margin-top:6px;font-size:10.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.75">${esc(u.label)}</span></div></td>`)
    .join("");
  const title = block.title.trim() ? `<p style="margin:0 0 10px;text-align:center;${EYEBROW};color:${p.muted}">${esc(block.title)}</p>` : "";
  return `<div style="margin:6px 0 20px">${title}<table ${TABLE} align="center" style="margin:0 auto"><tr>${cells}</tr></table>${note}</div>`;
}

function receiptHtml(block: Extract<EmailBlock, { type: "receipt" }>, p: ThemePalette) {
  const rule = `1px ${p.rule} ${p.line}`;
  const title = block.title.trim() ? `<tr><td colspan="2" style="padding:0 0 10px;${EYEBROW};color:${p.muted}">${esc(block.title)}</td></tr>` : "";
  const lines = block.lines
    .slice(0, 10)
    .map((line) => `<tr><td style="padding:12px 12px 12px 0;border-top:${rule};vertical-align:top"><span style="font-weight:700">${esc(line.name)}</span>${line.detail ? `<br><span style="font-size:13.5px;color:${p.muted}">${esc(line.detail)}</span>` : ""}</td><td align="right" style="padding:12px 0;border-top:${rule};vertical-align:top;font-family:${MONO};white-space:nowrap">${esc(line.amount)}</td></tr>`)
    .join("");
  const totals = block.totals
    .slice(0, 6)
    .map((row, i, all) => {
      const last = i === all.length - 1;
      const top = i === 0 ? `border-top:${last ? `2px solid ${p.dark ? "#F3EDE3" : "#16141F"}` : rule};` : last ? `border-top:2px solid ${p.dark ? "#F3EDE3" : "#16141F"};` : "";
      return `<tr><td style="padding:${last ? "12px" : "6px"} 12px ${last ? "4px" : "6px"} 0;${top}${last ? "font-size:17px;font-weight:800" : `color:${p.muted}`}">${esc(row.label)}</td><td align="right" style="padding:${last ? "12px" : "6px"} 0 ${last ? "4px" : "6px"};${top}font-family:${MONO};white-space:nowrap${last ? ";font-size:17px;font-weight:800" : ""}">${esc(row.amount)}</td></tr>`;
    })
    .join("");
  const note = block.note.trim() ? `<p style="margin:12px 0 0;font-size:13.5px;color:${p.muted}">${inline(block.note)}</p>` : "";
  const bg = safeColor(block.bg);
  return `<div style="margin:0 0 20px;${bg ? `padding:20px;background:${bg};border-radius:${p.radius}px` : ""}"><table ${TABLE} width="100%" style="border-collapse:collapse;font-size:15px">${title}${lines}${totals}</table>${note}</div>`;
}

function stepsHtml(block: Extract<EmailBlock, { type: "steps" }>, p: ThemePalette) {
  const steps = block.steps.slice(0, 5);
  if (!steps.length) return "";
  const current = Math.max(0, Math.min(steps.length - 1, Math.round(block.current)));
  const cells = steps
    .map((step, i) => {
      const done = i <= current;
      const bar = `<div style="height:6px;line-height:6px;font-size:1px;border-radius:3px;background:${done ? "{{brand_accent}}" : p.line}">&nbsp;</div>`;
      const label = `<p style="margin:8px 0 0;font-size:12.5px;line-height:1.3;${i === current ? "font-weight:800" : done ? "" : `color:${p.muted}`}">${i < current ? "&#10003; " : ""}${esc(step)}</p>`;
      return `<td valign="top" width="${Math.floor(100 / steps.length)}%" style="padding:0 3px">${bar}${label}</td>`;
    })
    .join("");
  const note = block.note.trim() ? `<p style="margin:14px 0 0;font-size:14px">${inline(block.note)}</p>` : "";
  return frame(block, `<div style="margin:6px 0 20px"><table ${TABLE} width="100%" style="table-layout:fixed"><tr>${cells}</tr></table>${note}</div>`, p);
}

function vipHtml(block: Extract<EmailBlock, { type: "vip" }>, p: ThemePalette) {
  const bg = safeColor(block.bg) || "#17141C";
  const ink = safeColor(block.color) || "#F5EFE6";
  const gradient = safeColor(block.bg) ? "" : ";background-image:linear-gradient(135deg,#17141C 0%,#2B2219 60%,#4A3820 100%)";
  const perks = block.perks.filter((perk) => perk.trim()).slice(0, 5).map((perk) => `<p style="margin:0 0 7px;font-size:14.5px;color:${ink}"><span style="color:#E8C077">&#10022;</span>&nbsp; ${inline(perk)}</p>`).join("");
  const href = safeUrl(block.buttonUrl);
  return `<table ${TABLE} width="100%" style="margin:0 0 20px"><tr><td bgcolor="${bg}" style="padding:28px 26px;border-radius:${Math.max(p.radius, 16) + 4}px;background:${bg}${gradient};color:${ink}">
<p style="margin:0 0 4px;${EYEBROW};color:#E8C077">{{store}} &middot; Member</p>
<p style="margin:0 0 14px;font-family:${SERIF};font-size:38px;line-height:1.05;letter-spacing:1px;color:#E8C077">${esc(block.tier)}</p>
${block.title.trim() ? `<p style="margin:0 0 8px;font-size:19px;font-weight:700;line-height:1.3;color:${ink}">${inline(block.title)}</p>` : ""}${block.text.trim() ? `<p style="margin:0 0 14px;font-size:15px;color:${ink};opacity:0.85">${inline(block.text)}</p>` : ""}${perks}
${block.buttonLabel.trim() && href ? `<p style="margin:18px 0 0">${button(block.buttonLabel, href, "#E8C077", "#17141C")}</p>` : ""}
<p style="margin:20px 0 0;font-family:${MONO};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${ink};opacity:0.6">{{name}}</p>
</td></tr></table>`;
}

function meterHtml(block: Extract<EmailBlock, { type: "meter" }>, p: ThemePalette) {
  const goal = Math.max(1, block.goal);
  const pct = Math.max(0, Math.min(100, Math.round((block.current / goal) * 100)));
  const fmt = (n: number) => Math.round(n).toLocaleString("en-NG");
  const cell = (width: string, color: string, radius: string) => `<td${width ? ` width="${width}"` : ""} style="height:12px;line-height:12px;font-size:1px;background:${color};border-radius:${radius}">&nbsp;</td>`;
  const bar = pct >= 100 ? cell("", "{{brand_accent}}", "999px") : pct <= 0 ? cell("", p.line, "999px") : `${cell(`${pct}%`, "{{brand_accent}}", "999px 0 0 999px")}${cell("", p.line, "0 999px 999px 0")}`;
  const ends = block.from.trim() || block.to.trim() ? `<table ${TABLE} width="100%" style="margin:8px 0 0"><tr><td style="font-size:12.5px;font-weight:700;color:${p.muted}">${esc(block.from)}</td><td align="right" style="font-size:12.5px;font-weight:800">${esc(block.to)}</td></tr></table>` : "";
  const inner = `${block.title.trim() ? `<p style="margin:0 0 6px;${EYEBROW};color:${p.muted}">${esc(block.title)}</p>` : ""}<p style="margin:0 0 12px;font-size:34px;font-weight:800;line-height:1.1;letter-spacing:-0.5px">${fmt(block.current)} <span style="font-size:15px;font-weight:600;color:${p.muted}">/ ${fmt(goal)} ${esc(block.unit)}</span></p><table ${TABLE} width="100%" style="border-collapse:separate"><tr>${bar}</tr></table>${ends}${block.note.trim() ? `<p style="margin:12px 0 0;font-size:14.5px">${inline(block.note)}</p>` : ""}`;
  const bg = safeColor(block.bg) || p.soft;
  return `<div style="margin:0 0 20px;padding:22px 22px 20px;border-radius:${p.radius + 2}px;background:${bg}${textStyle({ color: block.color })}">${inner}</div>`;
}

function gameGraphic(block: Extract<EmailBlock, { type: "game" }>, p: ThemePalette) {
  switch (block.game) {
    case "spin":
      // Four wedges from CSS borders on a zero-size circle, in a dark ring, with a pointer above.
      return `<p style="margin:0 0 4px;text-align:center;font-size:22px;line-height:1;color:{{brand_accent}}">&#9660;</p><table ${TABLE} align="center" style="margin:0 auto 18px"><tr><td style="padding:9px;border-radius:50%;background:#1F1B24"><div style="width:0;height:0;border-style:solid;border-width:84px;border-color:{{brand_accent}} #FFE7B0 {{brand_accent}} #FFFFFF;border-radius:50%;font-size:0;line-height:0"></div></td></tr></table>`;
    case "scratch":
      return `<div style="margin:0 auto 18px;max-width:380px;padding:6px;border-radius:20px;background:#E3E5EA"><div style="padding:30px 18px;border-radius:15px;background:#B9BEC8;background-image:repeating-linear-gradient(45deg,#B9BEC8 0,#B9BEC8 10px,#C8CCD4 10px,#C8CCD4 20px);text-align:center;color:#3F4450"><p style="margin:0 0 8px;font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:3px">&#10022; &#10022; &#10022; SCRATCH HERE &#10022; &#10022; &#10022;</p><p style="margin:0;font-size:34px;font-weight:900;letter-spacing:10px;line-height:1.1">? ? ?</p>${block.value.trim() ? `<p style="margin:10px 0 0;font-size:14px;font-weight:700">${esc(block.value)}</p>` : ""}</div></div>`;
    case "gift": {
      // A gift box from table cells: a lid and a box, each with a gold ribbon down the middle.
      const part = (width: number, height: number) => `<table ${TABLE} align="center" width="${width}" style="margin:0 auto"><tr><td width="42%" style="height:${height}px;line-height:${height}px;font-size:1px;background:{{brand_accent}}">&nbsp;</td><td width="16%" style="height:${height}px;line-height:${height}px;font-size:1px;background:#F2C14E">&nbsp;</td><td width="42%" style="height:${height}px;line-height:${height}px;font-size:1px;background:{{brand_accent}}">&nbsp;</td></tr></table>`;
      return `<div style="margin:0 0 18px"><p style="margin:0;text-align:center;font-size:30px;line-height:1;color:#F2C14E">&#10048;</p>${part(176, 28)}<div style="height:5px;line-height:5px;font-size:1px">&nbsp;</div>${part(156, 92)}</div>`;
    }
    case "draw":
      return `<table ${TABLE} align="center" width="100%" style="margin:0 auto 18px;max-width:420px"><tr><td width="38%" bgcolor="${p.deep}" style="padding:20px 12px;border-radius:14px 0 0 14px;background:${p.deep};color:#ffffff;text-align:center"><p style="margin:0 0 4px;font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.7">Ticket</p><p style="margin:0;font-family:${MONO};font-size:26px;font-weight:700;color:{{brand_accent}}">${esc(block.value || "No. 001")}</p></td><td style="padding:20px 16px;border-radius:0 14px 14px 0;border:2px dashed ${p.deep};border-left:0;background:${p.coupon};text-align:left"><p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase">Lucky draw</p><p style="margin:0;font-size:15px;font-weight:700;line-height:1.35">You&#39;re in. Good luck!</p></td></tr></table>`;
  }
}

function gameHtml(block: Extract<EmailBlock, { type: "game" }>, p: ThemePalette) {
  const href = safeUrl(block.buttonUrl);
  const prizes = block.prizes.filter((prize) => prize.trim()).slice(0, 6);
  const chips = prizes.length ? `<p style="margin:0 0 16px;text-align:center;line-height:2.2">${prizes.map((prize) => `<span style="display:inline-block;margin:0 3px;padding:4px 12px;border-radius:999px;background:${p.pill};font-size:13px;font-weight:700;line-height:1.6">${esc(prize)}</span>`).join(" ")}</p>` : "";
  const inner = [
    gameGraphic(block, p),
    block.title.trim() ? `<h2 style="margin:0 0 10px;font-size:26px;line-height:1.15;text-align:center${p.head}">${inline(block.title)}</h2>` : "",
    block.text.trim() ? `<p style="margin:0 0 16px;text-align:center">${inline(block.text)}</p>` : "",
    chips,
    block.buttonLabel.trim() && href ? `<p style="margin:6px 0 8px;text-align:center">${button(block.buttonLabel, href)}</p>` : "",
  ].join("");
  const bg = safeColor(block.bg);
  return `<div style="margin:0 0 20px;${bg ? `padding:28px 20px 18px;background:${bg};border-radius:${p.radius + 6}px` : "padding:8px 0 4px"}${textStyle({ color: block.color })}">${inner}</div>`;
}

function couponHtml(block: Extract<EmailBlock, { type: "coupon" }>, p: ThemePalette) {
  const code = esc(block.code.trim());
  if (block.variant === "ticket") {
    const bg = safeColor(block.bg) || p.coupon;
    const value = block.value?.trim() || "Gift";
    return `<table ${TABLE} width="100%" style="margin:6px 0 20px"><tr><td width="34%" bgcolor="{{brand_accent}}" style="padding:18px 10px;border-radius:16px 0 0 16px;background:{{brand_accent}};color:#ffffff;text-align:center;font-size:24px;font-weight:900;line-height:1.1;letter-spacing:-0.5px">${inline(value)}</td><td style="padding:16px 18px;border-radius:0 16px 16px 0;border:2px dashed {{brand_accent}};border-left:0;background:${bg}${textStyle({ color: block.color })}">${block.title ? `<p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">${inline(block.title)}</p>` : ""}<p style="margin:0;font-family:${MONO};font-size:24px;font-weight:700;letter-spacing:2px;color:{{brand_accent}}">${code}</p>${block.note ? `<p style="margin:6px 0 0;font-size:13.5px">${inline(block.note)}</p>` : ""}</td></tr></table>`;
  }
  if (block.variant === "bold") {
    const bg = safeColor(block.bg) || p.deep;
    const ink = safeColor(block.color) || "#ffffff";
    return `<table ${TABLE} width="100%" style="margin:6px 0 20px"><tr><td bgcolor="${bg}" style="padding:26px 20px;border-radius:${p.radius + 4}px;background:${bg};color:${ink};text-align:center">${block.title ? `<p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${ink};opacity:0.8">${inline(block.title)}</p>` : ""}${block.value?.trim() ? `<p style="margin:0 0 12px;font-size:46px;font-weight:900;line-height:1;letter-spacing:-1.5px;color:{{brand_accent}}">${inline(block.value)}</p>` : ""}<p style="margin:0"><span style="display:inline-block;padding:10px 18px;border:2px dashed ${ink};border-radius:12px;font-family:${MONO};font-size:22px;font-weight:700;letter-spacing:3px;color:${ink}">${code}</span></p>${block.note ? `<p style="margin:12px 0 0;font-size:13.5px;color:${ink};opacity:0.85">${inline(block.note)}</p>` : ""}</td></tr></table>`;
  }
  const bg = safeColor(block.bg) || p.coupon;
  return `<div style="margin:6px 0 20px;padding:${pad(block.pad) ?? 20}px 18px;border:2px dashed {{brand_accent}};border-radius:16px;background:${bg};text-align:center${textStyle({ color: block.color })}">${
    block.title ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${inline(block.title)}</p>` : ""
  }${block.value?.trim() ? `<p style="margin:0 0 6px;font-size:34px;font-weight:900;line-height:1.1;letter-spacing:-1px">${inline(block.value)}</p>` : ""}<p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:700;letter-spacing:3px;color:{{brand_accent}}">${code}</p>${
    block.note ? `<p style="margin:8px 0 0;font-size:14px">${inline(block.note)}</p>` : ""
  }</div>`;
}

function blockHtml(block: EmailBlock, p: ThemePalette = EMAIL_THEME_INFO.classic, first = false): string {
  switch (block.type) {
    case "heading": {
      const size = block.size === "sm" ? ["h3", 18] : block.size === "md" ? ["h2", 22] : ["h1", 26];
      return frame(block, `<${size[0]} style="margin:0 0 14px;font-size:${size[1]}px;line-height:1.2${p.head}${textStyle(block)}">${inline(block.text)}</${size[0]}>`, p);
    }
    case "text":
      return frame(
        block,
        block.text
          .split(/\n{2,}/)
          .map((paragraph) => `<p style="margin:0 0 14px${textStyle(block)}">${inline(paragraph)}</p>`)
          .join("\n"),
        p,
      );
    case "button": {
      const link = button(block.label, block.url, block.color, block.textColor, false, block.variant);
      return link ? frame({ ...block, color: undefined }, `<p style="margin:22px 0${block.align ? `;text-align:${block.align}` : ""}">${link}</p>`, p) : "";
    }
    case "image": {
      const url = imageUrl(block.url);
      if (!url) return "";
      const img = `<img src="${esc(url)}" alt="${esc(block.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border-radius:${p.radius}px;border:0" />`;
      const href = block.link ? safeUrl(block.link) : "";
      return frame(block, `<p style="margin:0 0 16px">${href ? `<a href="${esc(href)}">${img}</a>` : img}</p>`, p);
    }
    case "divider": {
      const color = safeColor(block.color);
      const align = block.align ?? "center";
      if (block.variant === "dots") return frame({ ...block, color: undefined }, `<p style="margin:22px 0;text-align:${align};font-size:12px;letter-spacing:12px;color:${color || "{{brand_accent}}"}">&#9679;&#9679;&#9679;</p>`, p);
      if (block.variant === "accent") return frame({ ...block, color: undefined }, `<div style="margin:24px ${align === "left" ? "auto 24px 0" : align === "right" ? "0 24px auto" : "auto"};width:56px;height:4px;line-height:4px;font-size:1px;border-radius:2px;background:${color || "{{brand_accent}}"}">&nbsp;</div>`, p);
      const style = block.variant === "dashed" ? `2px dashed ${color || p.line}` : `1px ${p.rule} ${color || p.line}`;
      return frame({ ...block, color: undefined }, `<hr style="border:0;border-top:${style};margin:22px 0" />`, p);
    }
    case "spacer": {
      const height = Math.max(4, Math.min(120, Math.round(Number(block.height) || 24)));
      return `<div style="height:${height}px;line-height:${height}px;font-size:1px">&nbsp;</div>`;
    }
    case "columns": {
      const cells = block.cells.slice(0, 2).map(cellHtml);
      return cells.some(Boolean) ? frame(block, fluidRow(cells, safeColor(block.bg) ? 256 : 272), p) : "";
    }
    case "products": {
      const label = block.buttonLabel || "Shop now";
      const list = block.items.slice(0, 6);
      if (!list.length) return "";
      const bg = Boolean(safeColor(block.bg));
      if (block.columns === 1) return frame(block, list.map((item) => featureProduct(item, label, p, bg)).join("\n"), p);
      if (block.columns === 3) {
        const rows: string[] = [];
        const cells = list.map((item) => productHtml(item, label, p, true));
        for (let i = 0; i < cells.length; i += 3) rows.push(fluidRow(cells.slice(i, i + 3), bg ? 170 : 181, { fixed: true }));
        return frame(block, rows.join("\n"), p);
      }
      const items = list.map((item) => productHtml(item, label, p));
      const rows: string[] = [];
      for (let i = 0; i < items.length; i += 2) rows.push(fluidRow(items.slice(i, i + 2), bg ? 256 : 272));
      return frame(block, rows.join("\n"), p);
    }
    case "coupon":
      return block.code.trim() ? couponHtml(block, p) : "";
    case "social": {
      const links = block.links
        .map((link) => {
          const url = safeUrl(link.url);
          return url ? `<a href="${esc(url)}" style="display:inline-block;margin:0 3px 6px;padding:7px 14px;border-radius:999px;background:${p.pill};color:inherit;font-size:13px;font-weight:700;text-decoration:none">${SOCIAL_LABELS[link.network] ?? "Link"}</a>` : "";
        })
        .filter(Boolean);
      return links.length ? frame(block, `<p style="margin:8px 0 14px;text-align:${block.align ?? "center"}">${links.join("")}</p>`, p) : "";
    }
    case "footer": {
      const color = safeColor(block.color) || p.muted;
      const text = block.text.trim() ? inline(block.text.trim()) : "";
      const stop = block.unsubscribe ? `${text ? "<br>" : ""}<a href="{{unsubscribe_url}}" style="color:${color}">Unsubscribe</a>` : "";
      if (!text && !stop) return "";
      if (block.variant === "panel") return `<div style="margin:28px 0 0;padding:20px 22px;border-radius:${p.radius}px;background:${safeColor(block.bg) || p.soft};text-align:${block.align ?? "center"}"><p style="margin:0 0 6px;font-size:14px;font-weight:800">{{store}}</p><p style="margin:0;font-size:12.5px;line-height:1.6;color:${color}">${text}${stop}</p></div>`;
      return `<p style="margin:24px 0 0;font-size:12.5px;line-height:1.6;color:${color};text-align:${block.align ?? "center"}">${text}${stop}</p>`;
    }
    case "theme":
      return "";
    case "hero":
      return heroHtml(block, p, first);
    case "banner": {
      const variant = block.variant ?? "accent";
      const bg = safeColor(block.bg) || (variant === "dark" ? p.deep : variant === "soft" ? p.soft : "{{brand_accent}}");
      const ink = safeColor(block.color) || (variant === "soft" ? "inherit" : "#ffffff");
      return block.text.trim() ? `<div style="margin:0 0 18px;padding:11px 16px;border-radius:${Math.min(p.radius, 12)}px;background:${bg};color:${ink};text-align:${block.align ?? "center"};font-size:12.5px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;line-height:1.5">${inline(block.text)}</div>` : "";
    }
    case "countdown":
      return countdownHtml(block, p);
    case "receipt":
      return block.lines.length || block.totals.length ? receiptHtml(block, p) : "";
    case "steps":
      return stepsHtml(block, p);
    case "review": {
      if (!block.quote.trim()) return "";
      const bg = safeColor(block.bg) || p.soft;
      const align = block.align ?? "left";
      return `<div style="margin:0 0 16px;padding:22px 22px 20px;border-radius:${p.radius + 2}px;background:${bg};text-align:${align}${textStyle({ color: block.color })}"><p style="margin:0 0 10px;font-size:18px;letter-spacing:3px;line-height:1">${stars(block.rating)}</p><p style="margin:0 0 12px;font-size:17px;line-height:1.5${p.head.includes("serif") ? `;font-family:${SERIF};font-style:italic` : ""}">&ldquo;${inline(block.quote)}&rdquo;</p><p style="margin:0;font-size:13.5px;font-weight:800">${esc(block.author || "A happy customer")}${block.detail ? ` <span style="font-weight:400;opacity:0.7">&middot; ${esc(block.detail)}</span>` : ""}</p></div>`;
    }
    case "features": {
      const items = block.items.filter((item) => item.title.trim()).slice(0, 3);
      if (!items.length) return "";
      const cells = items.map((item) => `${item.icon?.trim() ? `<div style="width:46px;height:46px;line-height:46px;margin:0 auto 10px;border-radius:50%;background:${p.soft};color:{{brand_accent}};font-size:18px;font-weight:800;text-align:center">${esc(item.icon.trim().slice(0, 3))}</div>` : ""}<p style="margin:0 0 4px;font-size:15px;font-weight:800;line-height:1.3">${inline(item.title)}</p>${item.text ? `<p style="margin:0;font-size:13.5px;line-height:1.45;opacity:0.8">${inline(item.text)}</p>` : ""}`);
      const bg = Boolean(safeColor(block.bg));
      return frame(block, fluidRow(cells, items.length === 3 ? (bg ? 170 : 181) : bg ? 256 : 272, { center: true }), p);
    }
    case "vip":
      return vipHtml(block, p);
    case "meter":
      return meterHtml(block, p);
    case "game":
      return gameHtml(block, p);
  }
}

/** The style family a list of blocks asks for (its first "theme" block), or "classic". */
export function themeOf(blocks: EmailBlock[]): EmailThemeName {
  const block = blocks.find((b): b is Extract<EmailBlock, { type: "theme" }> => b.type === "theme");
  return block ? block.theme : "classic";
}

export function blocksToHtml(blocks: EmailBlock[]) {
  const theme = themeOf(blocks);
  const p = EMAIL_THEME_INFO[theme];
  const visible = blocks.filter((block) => block.type !== "theme");
  const html = visible.map((block, i) => blockHtml(block, p, i === 0)).filter(Boolean).join("\n");
  return theme === "classic" ? html : `<!--${THEME_MARK}${theme}-->\n${html}`;
}

/** The style family saved in a body (the marker blocksToHtml writes), or "classic". */
export function readTheme(html: string): EmailThemeName {
  const match = new RegExp(`<!--${THEME_MARK}([a-z]+)-->`).exec(html);
  return match && (EMAIL_THEMES as readonly string[]).includes(match[1]) ? (match[1] as EmailThemeName) : "classic";
}

function encode(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decode(base64: string): unknown {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Body HTML with the blocks embedded, ready to save. */
export function htmlFromBlocks(blocks: EmailBlock[]) {
  return `<!--${MARK}${encode(blocks)}-->\n${blocksToHtml(blocks)}`;
}

const str = (value: unknown, max = 5000) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};
const pick = <T extends string>(value: unknown, options: readonly T[]): T | undefined => (options.includes(value as T) ? (value as T) : undefined);
const objects = (value: unknown, max: number) => (Array.isArray(value) ? value.slice(0, max).map((raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {})) : []);
const strings = (value: unknown, max: number, len: number) => (Array.isArray(value) ? value.slice(0, max).map((v) => str(v, len)) : []);

/** Copies only the valid style keys (absent keys stay absent, so old blocks round-trip unchanged). */
function readStyle(b: Record<string, unknown>): BlockStyle {
  const style: BlockStyle = {};
  if (typeof b.align === "string" && ALIGNS.includes(b.align as Align)) style.align = b.align as Align;
  if (safeColor(b.color)) style.color = safeColor(b.color);
  if (safeColor(b.bg)) style.bg = safeColor(b.bg);
  if (pad(b.pad) !== undefined) style.pad = pad(b.pad);
  return style;
}

function readCell(raw: unknown): ColumnCell {
  const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cell: ColumnCell = {};
  for (const [key, max] of [["imageUrl", 1000], ["alt", 200], ["heading", 200], ["text", 2000], ["buttonLabel", 80], ["buttonUrl", 1000]] as const) {
    if (typeof c[key] === "string") cell[key] = str(c[key], max);
  }
  return cell;
}

/** A variant key only when it's a known one (absent otherwise, so old blocks round-trip unchanged). */
const variant = <T extends string>(value: unknown, options: readonly T[]) => {
  const v = pick(value, options);
  return v ? { variant: v } : {};
};

export function parseBlock(raw: unknown): EmailBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const style = readStyle(b);
  switch (b.type) {
    case "heading": {
      const size = b.size === "md" || b.size === "sm" || b.size === "lg" ? { size: b.size as "lg" | "md" | "sm" } : {};
      return { type: "heading", text: str(b.text), ...size, ...style };
    }
    case "text":
      return { type: "text", text: str(b.text), ...style };
    case "button":
      return { type: "button", label: str(b.label, 80), url: str(b.url, 1000), ...(safeColor(b.textColor) ? { textColor: safeColor(b.textColor) } : {}), ...variant(b.variant, ["solid", "outline", "wide"] as const), ...style };
    case "image":
      return { type: "image", url: str(b.url, 1000), alt: str(b.alt, 200), ...(typeof b.link === "string" && b.link ? { link: str(b.link, 1000) } : {}), ...style };
    case "divider":
      return { type: "divider", ...variant(b.variant, ["line", "dashed", "dots", "accent"] as const), ...style };
    case "spacer":
      return { type: "spacer", height: Math.max(4, Math.min(120, Math.round(Number(b.height) || 24))), ...style };
    case "columns": {
      const cells = Array.isArray(b.cells) ? b.cells.slice(0, 2).map(readCell) : [];
      while (cells.length < 2) cells.push({});
      return { type: "columns", cells, ...style };
    }
    case "products": {
      const items = objects(b.items, 6).map((item) => {
        const out: ProductItem = { name: str(item.name, 160), price: str(item.price, 40), imageUrl: str(item.imageUrl, 1000), url: str(item.url, 1000) };
        if (typeof item.was === "string" && item.was) out.was = str(item.was, 40);
        if (typeof item.badge === "string" && item.badge) out.badge = str(item.badge, 24);
        return out;
      });
      const columns = b.columns === 1 || b.columns === 3 || b.columns === 2 ? { columns: b.columns as 1 | 2 | 3 } : {};
      return { type: "products", items, ...(typeof b.buttonLabel === "string" && b.buttonLabel ? { buttonLabel: str(b.buttonLabel, 40) } : {}), ...columns, ...style };
    }
    case "coupon":
      return {
        type: "coupon",
        code: str(b.code, 40),
        title: str(b.title, 120),
        note: str(b.note, 300),
        ...variant(b.variant, ["dashed", "ticket", "bold"] as const),
        ...(typeof b.value === "string" && b.value ? { value: str(b.value, 24) } : {}),
        ...style,
      };
    case "social": {
      const links = objects(b.links, 8)
        .filter((link) => SOCIAL_NETWORKS.includes(link.network as SocialNetwork))
        .map((link) => ({ network: link.network as SocialNetwork, url: str(link.url, 1000) }));
      return { type: "social", links, ...style };
    }
    case "footer":
      return { type: "footer", text: str(b.text, 1000), ...(b.unsubscribe === true ? { unsubscribe: true } : {}), ...variant(b.variant, ["simple", "panel"] as const), ...style };
    case "theme":
      return { type: "theme", theme: pick(b.theme, EMAIL_THEMES) ?? "classic" };
    case "hero":
      return {
        type: "hero",
        layout: pick(b.layout, ["full", "split", "type"] as const) ?? "full",
        imageUrl: str(b.imageUrl, 1000),
        alt: str(b.alt, 200),
        eyebrow: str(b.eyebrow, 60),
        heading: str(b.heading, 200),
        text: str(b.text, 1000),
        buttonLabel: str(b.buttonLabel, 60),
        buttonUrl: str(b.buttonUrl, 1000),
        ...style,
      };
    case "banner":
      return { type: "banner", text: str(b.text, 200), ...variant(b.variant, ["accent", "dark", "soft"] as const), ...style };
    case "countdown":
      return {
        type: "countdown",
        ...variant(b.variant, ["boxes", "pill", "bar"] as const),
        title: str(b.title, 80),
        units: objects(b.units, 4).map((u) => ({ value: str(u.value, 12), label: str(u.label, 24) })),
        note: str(b.note, 200),
        ...style,
      };
    case "receipt":
      return {
        type: "receipt",
        title: str(b.title, 80),
        lines: objects(b.lines, 10).map((line) => ({ name: str(line.name, 160), ...(typeof line.detail === "string" && line.detail ? { detail: str(line.detail, 80) } : {}), amount: str(line.amount, 40) })),
        totals: objects(b.totals, 6).map((row) => ({ label: str(row.label, 60), amount: str(row.amount, 40) })),
        note: str(b.note, 300),
        ...style,
      };
    case "steps": {
      const steps = strings(b.steps, 5, 40);
      return { type: "steps", steps, current: num(b.current, 0, Math.max(0, steps.length - 1), 0), note: str(b.note, 300), ...style };
    }
    case "review":
      return { type: "review", quote: str(b.quote, 600), author: str(b.author, 80), rating: num(b.rating, 1, 5, 5), detail: str(b.detail, 80), ...style };
    case "features":
      return {
        type: "features",
        items: objects(b.items, 3).map((item) => ({ ...(typeof item.icon === "string" && item.icon ? { icon: str(item.icon, 3) } : {}), title: str(item.title, 80), ...(typeof item.text === "string" && item.text ? { text: str(item.text, 200) } : {}) })),
        ...style,
      };
    case "vip":
      return { type: "vip", tier: str(b.tier, 24), title: str(b.title, 160), text: str(b.text, 600), perks: strings(b.perks, 5, 120), buttonLabel: str(b.buttonLabel, 60), buttonUrl: str(b.buttonUrl, 1000), ...style };
    case "meter":
      return { type: "meter", title: str(b.title, 80), current: num(b.current, 0, 10_000_000, 0), goal: num(b.goal, 1, 10_000_000, 100), unit: str(b.unit, 24), from: str(b.from, 40), to: str(b.to, 40), note: str(b.note, 300), ...style };
    case "game":
      return {
        type: "game",
        game: pick(b.game, ["spin", "scratch", "gift", "draw"] as const) ?? "spin",
        title: str(b.title, 160),
        text: str(b.text, 600),
        prizes: strings(b.prizes, 6, 40),
        value: str(b.value, 40),
        buttonLabel: str(b.buttonLabel, 60),
        buttonUrl: str(b.buttonUrl, 1000),
        ...style,
      };
    default:
      return null;
  }
}

export function parseBlocks(raw: unknown): EmailBlock[] {
  return Array.isArray(raw) ? raw.map(parseBlock).filter((block): block is EmailBlock => Boolean(block)).slice(0, 60) : [];
}

/** The blocks a body was written with, or null for hand-written HTML. */
export function readBlocks(html: string): EmailBlock[] | null {
  const match = new RegExp(`^\\s*(?:<!--${PRE_MARK}[A-Za-z0-9+/=]*-->\\s*)?<!--${MARK}([A-Za-z0-9+/=]+)-->`).exec(html);
  if (!match) return null;
  try {
    const parsed = decode(match[1]);
    return Array.isArray(parsed) ? parseBlocks(parsed) : null;
  } catch {
    return null;
  }
}

// ─── Preheader ───────────────────────────────────────────────────────────────
// Templates have no preheader column, so the preview line rides in its own comment, right after the blocks.

const PRE_RE = new RegExp(`<!--${PRE_MARK}([A-Za-z0-9+/=]*)-->\\n?`);

/** The preview line saved with a body, or "". */
export function readPreheader(html: string) {
  const match = PRE_RE.exec(html);
  if (!match) return "";
  try {
    const value = decode(match[1]);
    return typeof value === "string" ? value.slice(0, 200) : "";
  } catch {
    return "";
  }
}

/** The body with its preview line set (or removed when empty). */
export function withPreheader(html: string, preheader: string) {
  const clean = html.replace(PRE_RE, "");
  const text = preheader.trim().slice(0, 200);
  if (!text) return clean;
  const comment = `<!--${PRE_MARK}${encode(text)}-->\n`;
  const blocks = new RegExp(`^\\s*<!--${MARK}[A-Za-z0-9+/=]+-->\\n?`).exec(clean);
  return blocks ? `${blocks[0].endsWith("\n") ? blocks[0] : `${blocks[0]}\n`}${comment}${clean.slice(blocks[0].length)}` : `${comment}${clean}`;
}
