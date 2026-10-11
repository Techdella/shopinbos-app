// The visual email writer: a list of blocks (heading, text, button, image, divider) turned into simple,
// email-safe HTML. The blocks ride along in an HTML comment at the top of the body, so the editor can
// reopen what it wrote; HTML pasted by hand has no comment and opens in the HTML editor instead. Pure.

export type EmailBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "button"; label: string; url: string }
  | { type: "image"; url: string; alt: string }
  | { type: "divider" };

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => ESC[ch]);
const MARK = "sib-blocks:";

/** Link targets a button or image may use: https/http, mailto, tel, or a {{variable}} link. */
export function safeUrl(url: string) {
  const trimmed = url.trim();
  if (/^{{\s*[a-z_]+\s*}}$/.test(trimmed)) return trimmed;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return "";
}

/** **bold** and line breaks inside text blocks; everything else is escaped. */
function inline(text: string) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

export function blocksToHtml(blocks: EmailBlock[]) {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2">${inline(block.text)}</h1>`;
        case "text":
          return block.text
            .split(/\n{2,}/)
            .map((paragraph) => `<p style="margin:0 0 14px">${inline(paragraph)}</p>`)
            .join("\n");
        case "button": {
          const url = safeUrl(block.url);
          return url
            ? `<p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;background:{{brand_accent}};color:#ffffff;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:700">${esc(block.label || "Shop now")}</a></p>`
            : "";
        }
        case "image": {
          const url = safeUrl(block.url);
          return url && !url.startsWith("{{") ? `<p style="margin:0 0 16px"><img src="${esc(url)}" alt="${esc(block.alt)}" style="display:block;width:100%;max-width:100%;height:auto;border-radius:14px;border:0" /></p>` : "";
        }
        case "divider":
          return `<hr style="border:0;border-top:1px solid #E6E1F0;margin:22px 0" />`;
      }
    })
    .filter(Boolean)
    .join("\n");
}

function encode(blocks: EmailBlock[]) {
  const json = JSON.stringify(blocks);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Body HTML with the blocks embedded, ready to save. */
export function htmlFromBlocks(blocks: EmailBlock[]) {
  return `<!--${MARK}${encode(blocks)}-->\n${blocksToHtml(blocks)}`;
}

export function parseBlock(raw: unknown): EmailBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const s = (value: unknown, max = 5000) => (typeof value === "string" ? value.slice(0, max) : "");
  switch (b.type) {
    case "heading":
    case "text":
      return { type: b.type, text: s(b.text) };
    case "button":
      return { type: "button", label: s(b.label, 80), url: s(b.url, 1000) };
    case "image":
      return { type: "image", url: s(b.url, 1000), alt: s(b.alt, 200) };
    case "divider":
      return { type: "divider" };
    default:
      return null;
  }
}

/** The blocks a body was written with, or null for hand-written HTML. */
export function readBlocks(html: string): EmailBlock[] | null {
  const match = new RegExp(`^\\s*<!--${MARK}([A-Za-z0-9+/=]+)-->`).exec(html);
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? parsed.map(parseBlock).filter((block): block is EmailBlock => Boolean(block)).slice(0, 60) : null;
  } catch {
    return null;
  }
}
