// Pure helpers for the phone's Payment links and Link in bio screens (app/payment-links, app/link-in-bio).
// No imports, so tests/mobile-paylinks.test.mjs loads this file directly. The rules mirror the web's
// src/lib/payment-links/pure.ts and src/lib/bio/pure.ts (the server checks everything again).

// ─── Payment links ────────────────────────────────────────────────────────────

export const LINK_STATUSES = ["active", "paid", "expired", "cancelled"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];
export const LINK_FILTERS = ["all", ...LINK_STATUSES] as const;
export type LinkFilter = (typeof LINK_FILTERS)[number];

/** Same choices as the web's create form (EXPIRY_CHOICES). */
export const EXPIRY_CHOICES = ["1h", "24h", "3d", "7d", "30d", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

export const MAX_LINK_ITEMS = 10;
export const MAX_LINK_QUANTITY = 50;

/** One row of GET /api/app/payment-links (LinkListRow on the server). */
export interface PaymentLinkRow {
  id: string;
  code: string;
  url: string;
  title: string;
  status: LinkStatus;
  oneTime: boolean;
  amount: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  views: number;
  paidCount: number;
  order: { id: string; orderNumber: string } | null;
  buyerName: string | null;
  items: { name: string; quantity: number }[];
}

export function filterLinks(links: PaymentLinkRow[], filter: LinkFilter) {
  return filter === "all" ? links : links.filter((link) => link.status === filter);
}

/** How many links have each status (for the filter chips). */
export function countByStatus(links: PaymentLinkRow[]): Record<LinkFilter, number> {
  const counts: Record<LinkFilter, number> = { all: links.length, active: 0, paid: 0, expired: 0, cancelled: 0 };
  for (const link of links) if (link.status in counts) counts[link.status] += 1;
  return counts;
}

/** Only a link that can still be paid can be copied, shared or cancelled. */
export const canCancel = (link: Pick<PaymentLinkRow, "status">) => link.status === "active";

export interface DraftLine {
  productId: string;
  name: string;
  price: number;
  image: string | null;
  quantity: number;
}

/** Adds a product (or one more of it), up to 10 products. */
export function addLine(lines: DraftLine[], product: Omit<DraftLine, "quantity">): DraftLine[] {
  const existing = lines.find((line) => line.productId === product.productId);
  if (existing) return setQuantity(lines, product.productId, existing.quantity + 1);
  if (lines.length >= MAX_LINK_ITEMS) return lines;
  return [...lines, { ...product, quantity: 1 }];
}

/** Changes how many; 0 or less takes the product out; never more than 50. */
export function setQuantity(lines: DraftLine[], productId: string, quantity: number): DraftLine[] {
  if (quantity < 1) return lines.filter((line) => line.productId !== productId);
  return lines.map((line) => (line.productId === productId ? { ...line, quantity: Math.min(MAX_LINK_QUANTITY, Math.floor(quantity)) } : line));
}

export const linesTotal = (lines: DraftLine[]) => lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

/** Naira from what someone typed ("12,500" → 12500); null when empty or not more than 0. */
export function parseNaira(text: string): number | null {
  const clean = text.replace(/[,₦\s]/g, "");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export interface DraftForm {
  amount: string;
  note: string;
  buyerName: string;
  buyerPhone: string;
  oneTime: boolean;
  expiry: ExpiryChoice;
}

export type CreateProblem = "pickProduct" | "amount";

/** What's missing before a link can be made (null when it's ready). */
export function createProblem(lines: DraftLine[], form: Pick<DraftForm, "amount">): CreateProblem | null {
  if (!lines.length) return "pickProduct";
  if (form.amount.trim() && parseNaira(form.amount) === null) return "amount";
  return null;
}

/** The POST /api/app/payment-links body (CreatePaymentLinkSchema, which is strict: only these keys). */
export function createBody(lines: DraftLine[], form: DraftForm) {
  return {
    items: lines.slice(0, MAX_LINK_ITEMS).map((line) => ({ productId: line.productId, variantId: null, quantity: Math.min(MAX_LINK_QUANTITY, Math.max(1, line.quantity)) })),
    oneTime: form.oneTime,
    expiry: form.expiry,
    customAmount: parseNaira(form.amount),
    note: form.note.trim().slice(0, 500) || null,
    buyerName: form.buyerName.trim().slice(0, 120) || null,
    buyerPhone: form.buyerPhone.trim().slice(0, 40) || null,
  };
}

/** The new link's short title, like the web's: "Ankara tote", "Ankara tote + 2", or the shop's name. */
export function createdTitle(items: { name?: string }[], storeName: string) {
  const names = items.map((item) => item.name).filter(Boolean) as string[];
  if (!names.length) return storeName;
  return names.length > 1 ? `${names[0]} + ${names.length - 1}` : names[0];
}

/** A WhatsApp link with the message, to the buyer's number when there is one (0803… becomes 234803…). */
export function whatsappShareUrl(text: string, phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** A link without "https://", for showing on a small screen. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

// ─── Link in bio ──────────────────────────────────────────────────────────────

export const MAX_BIO_BLOCKS = 30;

/** A block on the bio page (the shapes the web saves; the phone edits product and link blocks). */
export type BioBlock =
  | { id: string; type: "product"; productId: string; action: "page" | "pay"; featured: boolean; label?: string; payCode?: string }
  | { id: string; type: "link"; label: string; url: string }
  | { id: string; type: "collection"; collectionId: string; label?: string }
  | { id: string; type: "socials"; links: Record<string, string | undefined> }
  | { id: string; type: "whatsapp"; phone: string; label?: string; message?: string }
  | { id: string; type: "signup"; title?: string; buttonLabel?: string }
  | { id: string; type: "text"; text: string };

/** GET /api/app/bio (SellerBioPage on the server). */
export interface BioPage {
  exists: boolean;
  published: boolean;
  title: string;
  bio: string;
  avatarUrl: string;
  theme: Record<string, unknown>;
  blocks: BioBlock[];
  views: number;
  clicks: Record<string, number>;
  url: string;
}

/** Swaps a block with the one above (-1) or below (+1); unchanged at the ends. */
export function moveBlock<B>(blocks: B[], index: number, by: -1 | 1): B[] {
  const target = index + by;
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) return blocks;
  const copy = [...blocks];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function removeBlock<B extends { id: string }>(blocks: B[], id: string): B[] {
  return blocks.filter((block) => block.id !== id);
}

/** A new block id (short, unique enough within one page; the server allows [A-Za-z0-9_-]). */
export function newBlockId(random = Math.random) {
  return `b${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}

/** Only web links (http/https), as the server checks (SafeUrl). "shop.com/x" gets https:// in front. */
export function cleanUrl(text: string): string | null {
  let value = text.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return value.slice(0, 500);
  } catch {
    return null;
  }
}

export type LinkBlockProblem = "label" | "url";

/** A custom link block from what the seller typed, or what to fix. */
export function linkBlock(label: string, url: string, random = Math.random): { ok: true; block: BioBlock } | { ok: false; problem: LinkBlockProblem } {
  const name = label.trim().slice(0, 80);
  if (!name) return { ok: false, problem: "label" };
  const href = cleanUrl(url);
  if (!href) return { ok: false, problem: "url" };
  return { ok: true, block: { id: newBlockId(random), type: "link", label: name, url: href } };
}

export function productBlock(productId: string, buyNow: boolean, random = Math.random): BioBlock {
  return { id: newBlockId(random), type: "product", productId, action: buyNow ? "pay" : "page", featured: false };
}

/** The PUT /api/app/bio body (BioPageSchema is strict: the page's own fields, never views, clicks or url). */
export function bioSaveBody(page: Pick<BioPage, "published" | "title" | "bio" | "avatarUrl" | "theme" | "blocks">) {
  return {
    published: page.published,
    title: page.title.trim().slice(0, 80) || null,
    bio: page.bio.trim().slice(0, 300) || null,
    avatarUrl: page.avatarUrl.trim() || "",
    theme: page.theme,
    blocks: page.blocks.slice(0, MAX_BIO_BLOCKS),
  };
}

/** Taps on one block (0 when it has none yet). */
export const blockTaps = (clicks: Record<string, number>, id: string) => clicks[id] ?? 0;
