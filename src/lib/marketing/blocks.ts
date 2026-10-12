// The visual email builder's blocks (heading, text, button, image, divider, spacer, two columns, product grid,
// coupon, social links, footer) turned into simple, email-safe HTML: inline styles only, and "fluid hybrid"
// columns (inline-block divs) that sit side by side on a computer and stack on a phone without media queries.
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
}

export const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok", "x", "whatsapp", "youtube", "website"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];
export const SOCIAL_LABELS: Record<SocialNetwork, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", x: "X", whatsapp: "WhatsApp", youtube: "YouTube", website: "Website" };

export type EmailBlock = (
  | { type: "heading"; text: string; size?: "lg" | "md" | "sm" }
  | { type: "text"; text: string }
  | { type: "button"; label: string; url: string; textColor?: string }
  | { type: "image"; url: string; alt: string; link?: string }
  | { type: "divider" }
  | { type: "spacer"; height: number }
  | { type: "columns"; cells: ColumnCell[] }
  | { type: "products"; items: ProductItem[]; buttonLabel?: string }
  | { type: "coupon"; code: string; title: string; note: string }
  | { type: "social"; links: Array<{ network: SocialNetwork; url: string }> }
  | { type: "footer"; text: string; unsubscribe?: boolean }
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
};

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => ESC[ch]);
const MARK = "sib-blocks:";
const PRE_MARK = "sib-pre:";

/** A #hex colour, or "" for anything else (so nothing can break out of a style attribute). */
export function safeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : "";
}

/** Link targets a button or image may use: https/http, mailto, tel, or a {{variable}} link. */
export function safeUrl(url: string) {
  const trimmed = (url ?? "").trim();
  if (/^{{\s*[a-z_]+\s*}}$/.test(trimmed)) return trimmed;
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

function textStyle(block: BlockStyle) {
  const color = safeColor(block.color);
  return `${block.align && ALIGNS.includes(block.align) ? `;text-align:${block.align}` : ""}${color ? `;color:${color}` : ""}`;
}

/** Wraps a block's HTML in its background panel / padding when it has one. */
function frame(block: BlockStyle, html: string) {
  const bg = safeColor(block.bg);
  const space = pad(block.pad);
  if (!bg && space === undefined) return html;
  const inner = bg ? `padding:${space ?? 18}px 20px;background:${bg};border-radius:14px` : `padding:${space}px 0`;
  return `<div style="margin:0 0 16px;${inner}">${html}</div>`;
}

function button(label: string, url: string, color = "", textColor = "", small = false) {
  const href = safeUrl(url);
  if (!href) return "";
  const size = small ? "padding:9px 16px;font-size:14px" : "padding:13px 22px";
  return `<a href="${esc(href)}" style="display:inline-block;background:${safeColor(color) || "{{brand_accent}}"};color:${safeColor(textColor) || "#ffffff"};${size};border-radius:999px;text-decoration:none;font-weight:700">${esc(label || "Shop now")}</a>`;
}

/** Two inline-block cells: side by side when there's room (about 520px), stacked on a phone. */
function fluidRow(cells: string[]) {
  return `<div style="font-size:0;line-height:0;margin:0 -6px 6px;text-align:left">${cells
    .map((cell) => `<div style="display:inline-block;width:100%;max-width:272px;vertical-align:top;box-sizing:border-box;padding:0 6px 14px;font-size:16px;line-height:1.55">${cell}</div>`)
    .join("")}</div>`;
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

function productHtml(item: ProductItem, label: string) {
  const img = imageUrl(item.imageUrl);
  const url = safeUrl(item.url);
  const picture = img ? `<img src="${esc(img)}" alt="${esc(item.name)}" width="260" style="display:block;width:100%;max-width:100%;height:auto;border-radius:12px;border:0;margin:0 0 10px;background:#F4F2F7" />` : "";
  return [
    url && picture ? `<a href="${esc(url)}" style="text-decoration:none">${picture}</a>` : picture,
    `<p style="margin:0 0 2px;font-size:15px;font-weight:700;line-height:1.35">${esc(item.name)}</p>`,
    item.price ? `<p style="margin:0 0 10px;font-size:15px;opacity:0.75">${esc(item.price)}</p>` : "",
    url ? `<p style="margin:0">${button(label, url, "", "", true)}</p>` : "",
  ].join("");
}

function blockHtml(block: EmailBlock): string {
  switch (block.type) {
    case "heading": {
      const size = block.size === "sm" ? ["h3", 18] : block.size === "md" ? ["h2", 22] : ["h1", 26];
      return frame(block, `<${size[0]} style="margin:0 0 14px;font-size:${size[1]}px;line-height:1.2${textStyle(block)}">${inline(block.text)}</${size[0]}>`);
    }
    case "text":
      return frame(
        block,
        block.text
          .split(/\n{2,}/)
          .map((paragraph) => `<p style="margin:0 0 14px${textStyle(block)}">${inline(paragraph)}</p>`)
          .join("\n"),
      );
    case "button": {
      const link = button(block.label, block.url, block.color, block.textColor);
      return link ? frame({ ...block, color: undefined }, `<p style="margin:22px 0${block.align ? `;text-align:${block.align}` : ""}">${link}</p>`) : "";
    }
    case "image": {
      const url = imageUrl(block.url);
      if (!url) return "";
      const img = `<img src="${esc(url)}" alt="${esc(block.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border-radius:14px;border:0" />`;
      const href = block.link ? safeUrl(block.link) : "";
      return frame(block, `<p style="margin:0 0 16px">${href ? `<a href="${esc(href)}">${img}</a>` : img}</p>`);
    }
    case "divider":
      return frame({ ...block, color: undefined }, `<hr style="border:0;border-top:1px solid ${safeColor(block.color) || "#E6E1F0"};margin:22px 0" />`);
    case "spacer": {
      const height = Math.max(4, Math.min(120, Math.round(Number(block.height) || 24)));
      return `<div style="height:${height}px;line-height:${height}px;font-size:1px">&nbsp;</div>`;
    }
    case "columns": {
      const cells = block.cells.slice(0, 2).map(cellHtml);
      return cells.some(Boolean) ? frame(block, fluidRow(cells)) : "";
    }
    case "products": {
      const items = block.items.slice(0, 6).map((item) => productHtml(item, block.buttonLabel || "Shop now"));
      if (!items.length) return "";
      const rows: string[] = [];
      for (let i = 0; i < items.length; i += 2) rows.push(fluidRow(items.slice(i, i + 2)));
      return frame(block, rows.join("\n"));
    }
    case "coupon": {
      if (!block.code.trim()) return "";
      const bg = safeColor(block.bg) || "#FFF7F0";
      return `<div style="margin:6px 0 20px;padding:${pad(block.pad) ?? 20}px 18px;border:2px dashed {{brand_accent}};border-radius:16px;background:${bg};text-align:center${textStyle({ color: block.color })}">${
        block.title ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">${inline(block.title)}</p>` : ""
      }<p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:700;letter-spacing:3px;color:{{brand_accent}}">${esc(block.code.trim())}</p>${
        block.note ? `<p style="margin:8px 0 0;font-size:14px">${inline(block.note)}</p>` : ""
      }</div>`;
    }
    case "social": {
      const links = block.links
        .map((link) => {
          const url = safeUrl(link.url);
          return url ? `<a href="${esc(url)}" style="display:inline-block;margin:0 3px 6px;padding:7px 14px;border-radius:999px;background:#F1EFF5;color:inherit;font-size:13px;font-weight:700;text-decoration:none">${SOCIAL_LABELS[link.network] ?? "Link"}</a>` : "";
        })
        .filter(Boolean);
      return links.length ? frame(block, `<p style="margin:8px 0 14px;text-align:${block.align ?? "center"}">${links.join("")}</p>`) : "";
    }
    case "footer": {
      const color = safeColor(block.color) || "#7A7686";
      const text = block.text.trim() ? inline(block.text.trim()) : "";
      const stop = block.unsubscribe ? `${text ? "<br>" : ""}<a href="{{unsubscribe_url}}" style="color:${color}">Unsubscribe</a>` : "";
      return text || stop ? `<p style="margin:24px 0 0;font-size:12.5px;line-height:1.6;color:${color};text-align:${block.align ?? "center"}">${text}${stop}</p>` : "";
    }
  }
}

export function blocksToHtml(blocks: EmailBlock[]) {
  return blocks.map(blockHtml).filter(Boolean).join("\n");
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
      return { type: "button", label: str(b.label, 80), url: str(b.url, 1000), ...(safeColor(b.textColor) ? { textColor: safeColor(b.textColor) } : {}), ...style };
    case "image":
      return { type: "image", url: str(b.url, 1000), alt: str(b.alt, 200), ...(typeof b.link === "string" && b.link ? { link: str(b.link, 1000) } : {}), ...style };
    case "divider":
      return { type: "divider", ...style };
    case "spacer":
      return { type: "spacer", height: Math.max(4, Math.min(120, Math.round(Number(b.height) || 24))), ...style };
    case "columns": {
      const cells = Array.isArray(b.cells) ? b.cells.slice(0, 2).map(readCell) : [];
      while (cells.length < 2) cells.push({});
      return { type: "columns", cells, ...style };
    }
    case "products": {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 6).map((raw) => {
        const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        return { name: str(item.name, 160), price: str(item.price, 40), imageUrl: str(item.imageUrl, 1000), url: str(item.url, 1000) };
      });
      return { type: "products", items, ...(typeof b.buttonLabel === "string" && b.buttonLabel ? { buttonLabel: str(b.buttonLabel, 40) } : {}), ...style };
    }
    case "coupon":
      return { type: "coupon", code: str(b.code, 40), title: str(b.title, 120), note: str(b.note, 300), ...style };
    case "social": {
      const links = (Array.isArray(b.links) ? b.links : [])
        .slice(0, 8)
        .map((raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}))
        .filter((link) => SOCIAL_NETWORKS.includes(link.network as SocialNetwork))
        .map((link) => ({ network: link.network as SocialNetwork, url: str(link.url, 1000) }));
      return { type: "social", links, ...style };
    }
    case "footer":
      return { type: "footer", text: str(b.text, 1000), ...(b.unsubscribe === true ? { unsubscribe: true } : {}), ...style };
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
