// Product news emails (topic "product_news") that admins write at /admin/product-news: the body format (simple
// markdown, escaped), which images are allowed, who gets it and the email itself. Pure (zod + the shell only), so
// the admin page draws its live preview with the same code the sender uses, and
// tests/weekly-summary-product-news.test.mjs can run it.

import { z } from "zod";
import { EMAIL_COLORS, FONT, escapeHtml, platformEmail, safeHref, type PlatformLegal } from "./shell.ts";

export const PRODUCT_NEWS_AUDIENCES = [
  { key: "seller", label: "Sellers" },
  { key: "supplier", label: "Suppliers" },
  { key: "logistics_partner", label: "Delivery partners" },
] as const;
export type NewsAudience = (typeof PRODUCT_NEWS_AUDIENCES)[number]["key"];
export const ALL_NEWS_AUDIENCES: NewsAudience[] = PRODUCT_NEWS_AUDIENCES.map((a) => a.key);

export function audienceLabel(audience: readonly string[]) {
  if (ALL_NEWS_AUDIENCES.every((key) => audience.includes(key))) return "Everyone";
  return PRODUCT_NEWS_AUDIENCES.filter((a) => audience.includes(a.key)).map((a) => a.label).join(", ") || "Nobody";
}

// ─── Body: simple markdown, everything escaped ──────────────────────────────────
// Blank line = new paragraph · "## " = subheading · "- " lines = bullet list · **bold** · *italic* ·
// [label](https://link). Anything else (HTML included) is shown as text.

function emphasis(escaped: string) {
  return escaped.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
}

/** One line of markdown to safe inline HTML: links must be http(s) or mailto, everything else is escaped. */
export function newsInline(raw: string) {
  let out = "";
  let last = 0;
  for (const match of raw.matchAll(/\[([^\]\n]{1,200})\]\(([^)\s]{1,2000})\)/g)) {
    out += emphasis(escapeHtml(raw.slice(last, match.index)));
    const ok = /^(https?:\/\/|mailto:)/i.test(match[2]);
    out += ok
      ? `<a href="${safeHref(match[2])}" class="sib-link" style="color:${EMAIL_COLORS.teal};text-decoration:underline">${emphasis(escapeHtml(match[1]))}</a>`
      : emphasis(escapeHtml(match[0]));
    last = (match.index ?? 0) + match[0].length;
  }
  return out + emphasis(escapeHtml(raw.slice(last)));
}

export function renderNewsBody(markdown: string) {
  const blocks = String(markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
      if (/^#{2,3}\s+/.test(block) && !block.includes("\n"))
        return `<h2 class="sib-ink" style="margin:20px 0 10px;font-family:${FONT};font-size:18px;line-height:1.3;font-weight:700;color:${EMAIL_COLORS.navy}">${newsInline(block.replace(/^#{2,3}\s+/, ""))}</h2>`;
      const lines = block.split("\n");
      if (lines.every((line) => /^\s*[-*•]\s+/.test(line)))
        return `<ul class="sib-ink" style="margin:0 0 16px;padding-left:20px;color:${EMAIL_COLORS.navy}">${lines.map((line) => `<li style="margin:0 0 6px">${newsInline(line.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
      return `<p class="sib-ink" style="margin:0 0 14px;color:${EMAIL_COLORS.navy}">${lines.map(newsInline).join("<br>")}</p>`;
    })
    .join("");
}

// ─── Images: https, from our own storage or site only ───────────────────────────

export interface NewsImageHosts {
  /** Supabase Storage hosts: only public object paths (/storage/v1/object/public/…). */
  storage: string[];
  /** Our own sites (the app, shopinbos.com): any path. */
  own: string[];
  /** Local development only: the storage URL itself is http on a loopback host (the mock Supabase), so http is accepted for it. */
  localStorageHttp?: boolean;
}

export function isAllowedNewsImage(url: string | null | undefined, hosts: NewsImageHosts) {
  const value = String(url ?? "").trim();
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  const host = parsed.host.toLowerCase();
  const isStorage = hosts.storage.map((h) => h.toLowerCase()).includes(host) && parsed.pathname.startsWith("/storage/v1/object/public/");
  if (parsed.protocol === "http:" && hosts.localStorageHttp && isStorage && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return true;
  if (parsed.protocol !== "https:") return false;
  if (isStorage) return true;
  return hosts.own.some((own) => {
    const o = own.toLowerCase();
    return host === o || host.endsWith(`.${o}`);
  });
}

// ─── Validation ──────────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max);
const httpUrl = z.string().trim().max(2000).regex(/^https?:\/\/[^\s<>"']+$/i, "Links must start with https://");

/** The fields an admin writes. `hosts` decides which image URLs are allowed. */
export function productNewsSchema(hosts: NewsImageHosts) {
  return z
    .object({
      subject: text(160).min(1, "Add a subject"),
      preheader: text(200).optional().nullable(),
      heading: text(160).min(1, "Add a heading"),
      body: text(20_000).min(1, "Write the email"),
      imageUrl: z
        .string()
        .trim()
        .max(2000)
        .optional()
        .nullable()
        .refine((value) => !value || isAllowedNewsImage(value, hosts), "Images must be https links from Shopinbos storage (upload it first) or shopinbos.com"),
      ctaLabel: text(60).optional().nullable(),
      ctaUrl: httpUrl.optional().nullable().or(z.literal("")),
      audience: z.array(z.enum(["seller", "supplier", "logistics_partner"])).min(1, "Pick who gets it").max(3),
    })
    .refine((value) => Boolean(value.ctaLabel?.trim()) === Boolean(value.ctaUrl?.trim()), { message: "A button needs both a label and a link", path: ["ctaUrl"] });
}

export type ProductNewsInput = z.infer<ReturnType<typeof productNewsSchema>>;

// ─── Who gets it ─────────────────────────────────────────────────────────────

export interface NewsCandidate {
  id: string;
  role: string;
  email: string | null;
  /** They turned off "Product news and tips". */
  productNewsOff: boolean;
}

/** Splits users into who gets it and who's skipped because of their preferences (and drops anyone outside the audience or with no email). */
export function splitNewsAudience<T extends NewsCandidate>(users: T[], audience: readonly string[]) {
  const send: T[] = [];
  const skipped: T[] = [];
  for (const user of users) {
    if (!audience.includes(user.role) || !user.email?.trim()) continue;
    (user.productNewsOff ? skipped : send).push(user);
  }
  return { send, skipped };
}

/** One row per broadcast and user (the unique key that stops a retry sending twice). */
export function productNewsRecipientKey(broadcastId: string, userId: string) {
  return `${broadcastId}:${userId}`;
}

// ─── The email ───────────────────────────────────────────────────────────────

export interface ProductNewsContent {
  subject: string;
  preheader?: string | null;
  heading: string;
  body: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export function productNewsBody(content: ProductNewsContent, hosts: NewsImageHosts) {
  const image = content.imageUrl && isAllowedNewsImage(content.imageUrl, hosts)
    ? `<img src="${escapeHtml(content.imageUrl.trim())}" width="536" alt="${escapeHtml(content.heading)}" style="display:block;width:100%;max-width:536px;height:auto;margin:0 0 20px;border:0;border-radius:14px" />`
    : "";
  return `${image}${renderNewsBody(content.body)}`;
}

export function productNewsCta(content: ProductNewsContent) {
  return content.ctaLabel?.trim() && content.ctaUrl?.trim() && /^https?:\/\//i.test(content.ctaUrl.trim()) ? { label: content.ctaLabel.trim(), url: content.ctaUrl.trim() } : null;
}

/** The whole email in the shell: the admin page's live preview (the sender builds the same with buildPlatformEmail). */
export function productNewsDocument(content: ProductNewsContent, input: { appUrl: string; legal: PlatformLegal; hosts: NewsImageHosts; reason: string; unsubscribeUrl?: string | null; preferencesUrl?: string | null }) {
  return platformEmail({
    appUrl: input.appUrl,
    kind: "lifecycle",
    eyebrow: "Product news",
    heading: content.heading || "Your heading",
    bodyHtml: productNewsBody(content, input.hosts),
    preheader: content.preheader || null,
    cta: productNewsCta(content),
    reason: input.reason,
    legal: input.legal,
    unsubscribeUrl: input.unsubscribeUrl ?? "#",
    preferencesUrl: input.preferencesUrl ?? "#",
  });
}
