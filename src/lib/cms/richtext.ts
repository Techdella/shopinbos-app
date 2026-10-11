// Rich text for CMS items: the editor (Tiptap) saves a JSON document; the server keeps only the nodes, marks
// and attributes listed here and builds the HTML itself from that JSON, escaping every piece of text and
// checking every link. Browser HTML is never trusted or stored, so a post can't carry a <script>, an onclick
// or a javascript: link. Pure (no imports) so it is unit-tested in tests/behaviour.test.mjs.

export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface RichDoc {
  type: "doc";
  content: RichNode[];
}

export const EMPTY_DOC: RichDoc = { type: "doc", content: [{ type: "paragraph" }] };

const BLOCKS = new Set([
  "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule",
  "hardBreak", "image", "youtube", "table", "tableRow", "tableHeader", "tableCell", "callout", "button", "productCard", "text",
]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);
const ALIGN = new Set(["left", "center", "right", "justify"]);
export const CALLOUT_TONES = ["info", "tip", "success", "warning"] as const;
const MAX_NODES = 20000;
const MAX_DEPTH = 24;

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown, max = 2000) => (typeof value === "string" ? value.slice(0, max) : "");
const int = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** Links the store may point at: http(s), mailto, tel, same-site paths and #anchors. Anything else is dropped. */
export function safeLinkUrl(raw: unknown): string {
  const value = text(raw, 2000).trim();
  if (!value) return "";
  if (value.startsWith("#")) return /^#[\w-]*$/.test(value) ? value : "";
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return url.toString();
  } catch {
    /* not a URL */
  }
  return "";
}

/** Images: https/http or a same-site path. No data: or javascript: URLs. */
export function safeImageUrl(raw: unknown): string {
  const value = text(raw, 2000).trim();
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** YouTube watch/short/share/embed links → the privacy-friendly embed URL, or "" when it isn't YouTube. */
export function youtubeEmbedUrl(raw: unknown): string {
  const value = text(raw, 500).trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
    else {
      const match = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname);
      id = match?.[1] ?? "";
    }
  }
  return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
}

/** Vimeo page or player links → the player URL, or "". */
export function vimeoEmbedUrl(raw: unknown): string {
  const value = text(raw, 500).trim();
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "vimeo.com" && host !== "player.vimeo.com") return "";
    const id = /(\d{5,12})/.exec(url.pathname)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : "";
  } catch {
    return "";
  }
}

function cleanMarks(marks: unknown): RichNode["marks"] {
  if (!Array.isArray(marks)) return undefined;
  const out: NonNullable<RichNode["marks"]> = [];
  for (const raw of marks.slice(0, 8)) {
    const mark = rec(raw);
    const type = text(mark.type, 20);
    if (!MARKS.has(type) || out.some((m) => m.type === type)) continue;
    if (type === "link") {
      const href = safeLinkUrl(rec(mark.attrs).href);
      if (!href) continue;
      out.push({ type, attrs: { href, target: rec(mark.attrs).target === "_blank" ? "_blank" : null } });
    } else out.push({ type });
  }
  return out.length ? out : undefined;
}

function alignAttr(attrs: Record<string, unknown>) {
  const align = text(attrs.textAlign, 10);
  return ALIGN.has(align) && align !== "left" ? align : null;
}

/**
 * Keeps only known nodes/marks/attributes from an editor document. Unknown nodes are unwrapped (their text
 * kept) rather than dropped, so pasted content isn't lost.
 */
export function sanitizeDoc(raw: unknown): RichDoc {
  let budget = MAX_NODES;
  const walk = (input: unknown, depth: number): RichNode[] => {
    if (budget <= 0 || depth > MAX_DEPTH) return [];
    const node = rec(input);
    const type = text(node.type, 40);
    budget--;
    const attrs = rec(node.attrs);
    const children = () => (Array.isArray(node.content) ? node.content.flatMap((child) => walk(child, depth + 1)) : []);
    if (!BLOCKS.has(type)) return children();
    switch (type) {
      case "text": {
        const value = text(node.text, 20000);
        if (!value) return [];
        const marks = cleanMarks(node.marks);
        return [marks ? { type, text: value, marks } : { type, text: value }];
      }
      case "paragraph":
        return [withContent({ type, attrs: { textAlign: alignAttr(attrs) } }, children())];
      case "heading":
        return [withContent({ type, attrs: { level: int(attrs.level, 1, 4, 2), textAlign: alignAttr(attrs) } }, children())];
      case "orderedList":
        return [withContent({ type, attrs: { start: int(attrs.start, 1, 100000, 1) } }, children())];
      case "codeBlock":
        return [withContent({ type, attrs: { language: /^[\w+-]{1,20}$/.test(text(attrs.language, 20)) ? text(attrs.language, 20) : null } }, children().filter((child) => child.type === "text").map((child) => ({ type: "text", text: child.text })))];
      case "horizontalRule":
      case "hardBreak":
        return [{ type }];
      case "image": {
        const src = safeImageUrl(attrs.src);
        return src ? [{ type, attrs: { src, alt: text(attrs.alt, 300), title: text(attrs.title, 300) || null } }] : [];
      }
      case "youtube": {
        const src = youtubeEmbedUrl(attrs.src);
        return src ? [{ type, attrs: { src } }] : [];
      }
      case "callout": {
        const tone = (CALLOUT_TONES as readonly string[]).includes(text(attrs.tone, 10)) ? text(attrs.tone, 10) : "info";
        return [withContent({ type, attrs: { tone } }, children())];
      }
      case "button": {
        const href = safeLinkUrl(attrs.href);
        const label = text(attrs.label, 80).trim();
        return href && label ? [{ type, attrs: { href, label, variant: attrs.variant === "outline" ? "outline" : "solid" } }] : [];
      }
      case "productCard": {
        const productId = text(attrs.productId, 64).trim();
        // name/image are only for the editor's placeholder; the storefront reads the live product.
        return /^[\w-]{1,64}$/.test(productId) ? [{ type, attrs: { productId, name: text(attrs.name, 160), image: safeImageUrl(attrs.image) || null } }] : [];
      }
      case "tableCell":
      case "tableHeader":
        return [withContent({ type, attrs: { colspan: int(attrs.colspan, 1, 20, 1), rowspan: int(attrs.rowspan, 1, 50, 1) } }, children())];
      default:
        return [withContent({ type }, children())];
    }
  };
  const root = rec(raw);
  const content = Array.isArray(root.content) ? root.content.flatMap((child) => walk(child, 1)) : [];
  // Bare text at the top level goes into a paragraph.
  const blocks = content.map((node) => (node.type === "text" || node.type === "hardBreak" ? { type: "paragraph", content: [node] } : node));
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}

function withContent(node: RichNode, content: RichNode[]): RichNode {
  if (node.attrs && Object.values(node.attrs).every((value) => value === null)) delete node.attrs;
  return content.length ? { ...node, content } : node;
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface ProductCardData {
  name: string;
  href: string;
  image: string | null;
  price: string;
}

export interface RenderOptions {
  /** Product cards are filled in from this map (id → product); a missing product renders nothing. */
  products?: Record<string, ProductCardData>;
}

function renderMarks(value: string, marks: RichNode["marks"]) {
  let html = escapeHtml(value).replace(/\n/g, "<br>");
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold": html = `<strong>${html}</strong>`; break;
      case "italic": html = `<em>${html}</em>`; break;
      case "underline": html = `<u>${html}</u>`; break;
      case "strike": html = `<s>${html}</s>`; break;
      case "code": html = `<code>${html}</code>`; break;
      case "link": {
        const href = safeLinkUrl(mark.attrs?.href);
        if (!href) break;
        const external = /^https?:/.test(href);
        html = `<a href="${escapeHtml(href)}"${mark.attrs?.target === "_blank" || external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ""}>${html}</a>`;
        break;
      }
    }
  }
  return html;
}

const alignStyle = (node: RichNode) => {
  const align = alignAttr(rec(node.attrs));
  return align ? ` style="text-align:${align}"` : "";
};

/** HTML for a sanitised document. Call sanitizeDoc first on anything that came from a browser. */
export function renderDoc(doc: RichDoc, options: RenderOptions = {}): string {
  const inner = (node: RichNode): string => (node.content ?? []).map(render).join("");
  const render = (node: RichNode): string => {
    const attrs = rec(node.attrs);
    switch (node.type) {
      case "text": return renderMarks(node.text ?? "", node.marks);
      case "paragraph": return `<p${alignStyle(node)}>${inner(node)}</p>`;
      case "heading": {
        // h1 is the item title, so document headings start at h2.
        const level = Math.min(6, int(attrs.level, 1, 4, 2) + 1);
        const content = inner(node);
        const id = plainText(node).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
        return `<h${level}${id ? ` id="${id}"` : ""}${alignStyle(node)}>${content}</h${level}>`;
      }
      case "bulletList": return `<ul>${inner(node)}</ul>`;
      case "orderedList": {
        const start = int(attrs.start, 1, 100000, 1);
        return `<ol${start !== 1 ? ` start="${start}"` : ""}>${inner(node)}</ol>`;
      }
      case "listItem": return `<li>${inner(node)}</li>`;
      case "blockquote": return `<blockquote>${inner(node)}</blockquote>`;
      case "codeBlock": return `<pre><code>${escapeHtml((node.content ?? []).map((child) => child.text ?? "").join(""))}</code></pre>`;
      case "horizontalRule": return "<hr>";
      case "hardBreak": return "<br>";
      case "image": {
        const src = safeImageUrl(attrs.src);
        if (!src) return "";
        const caption = text(attrs.title, 300);
        const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(text(attrs.alt, 300))}" loading="lazy">`;
        return caption ? `<figure>${img}<figcaption>${escapeHtml(caption)}</figcaption></figure>` : `<figure>${img}</figure>`;
      }
      case "youtube": {
        const src = youtubeEmbedUrl(attrs.src);
        return src ? `<div class="cms-embed"><iframe src="${escapeHtml(src)}" title="YouTube video" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : "";
      }
      case "table": return `<div class="cms-table"><table><tbody>${inner(node)}</tbody></table></div>`;
      case "tableRow": return `<tr>${inner(node)}</tr>`;
      case "tableHeader":
      case "tableCell": {
        const tag = node.type === "tableHeader" ? "th" : "td";
        const colspan = int(attrs.colspan, 1, 20, 1);
        const rowspan = int(attrs.rowspan, 1, 50, 1);
        return `<${tag}${colspan > 1 ? ` colspan="${colspan}"` : ""}${rowspan > 1 ? ` rowspan="${rowspan}"` : ""}>${inner(node)}</${tag}>`;
      }
      case "callout": {
        const tone = (CALLOUT_TONES as readonly string[]).includes(text(attrs.tone, 10)) ? text(attrs.tone, 10) : "info";
        return `<aside class="cms-callout cms-callout-${tone}">${inner(node)}</aside>`;
      }
      case "button": {
        const href = safeLinkUrl(attrs.href);
        const label = text(attrs.label, 80);
        if (!href || !label) return "";
        const external = /^https?:/.test(href);
        return `<p class="cms-button-row"><a class="cms-button${attrs.variant === "outline" ? " cms-button-outline" : ""}" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(label)}</a></p>`;
      }
      case "productCard": {
        const product = options.products?.[text(attrs.productId, 64)];
        if (!product) return "";
        const href = safeLinkUrl(product.href);
        const image = product.image ? safeImageUrl(product.image) : "";
        return `<a class="cms-product" href="${escapeHtml(href)}">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}<span><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.price)}</span></span></a>`;
      }
      default: return inner(node);
    }
  };
  return doc.content.map(render).join("");
}

/** Plain text of a node or document (blocks separated by newlines). */
export function plainText(node: RichNode | RichDoc): string {
  if ((node as RichNode).type === "text") return (node as RichNode).text ?? "";
  const parts = ((node as RichNode).content ?? []).map((child) => plainText(child));
  const block = ["doc", "bulletList", "orderedList", "table", "tableRow", "blockquote", "callout", "listItem"].includes(node.type);
  return parts.join(block ? "\n" : "");
}

export function firstParagraphText(doc: RichDoc) {
  const first = doc.content.find((node) => node.type === "paragraph" && plainText(node).trim());
  return first ? plainText(first).trim() : "";
}

export function wordCount(doc: RichDoc) {
  return plainText(doc).split(/\s+/).filter(Boolean).length;
}

export function docImages(doc: RichDoc) {
  let total = 0;
  let missingAlt = 0;
  const walk = (node: RichNode) => {
    if (node.type === "image") {
      total++;
      if (!text(rec(node.attrs).alt).trim()) missingAlt++;
    }
    (node.content ?? []).forEach(walk);
  };
  doc.content.forEach(walk);
  return { total, missingAlt };
}

export function docProductIds(doc: RichDoc) {
  const ids = new Set<string>();
  const walk = (node: RichNode) => {
    if (node.type === "productCard") ids.add(text(rec(node.attrs).productId, 64));
    (node.content ?? []).forEach(walk);
  };
  doc.content.forEach(walk);
  return [...ids].filter(Boolean);
}

/** A short plain-text summary (for excerpts and descriptions). */
export function summarize(doc: RichDoc, max = 160) {
  const value = plainText(doc).replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}
