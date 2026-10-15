// Payment links: the rules that don't need a database. Codes, whether a link can still be paid, what the buyer
// may choose (options, quantity), the agreed-price maths, the limits on links Peggy makes in customer chats, and the
// zod shapes the seller API and Peggy share. No server imports, so tests/payment-links.test.mjs loads it directly.

import { z } from "zod";
import { normalizeVariants, variantPrice } from "../../../shared/product-variants.ts";

// ─── Codes ────────────────────────────────────────────────────────────────────

/** No 0/O, 1/l/I or u/v look-alikes, so a code read out on a call or copied by hand still works. */
export const LINK_CODE_ALPHABET = "abcdefghjkmnpqrstwxyz23456789";
export const LINK_CODE_LENGTH = 12;
const CODE_PATTERN = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`);

/**
 * A fresh public code: 12 characters from a 29-letter alphabet (about 58 bits), from the platform's secure random
 * source. `random` is only for tests.
 */
export function newLinkCode(random: (size: number) => Uint8Array = (size) => globalThis.crypto.getRandomValues(new Uint8Array(size))): string {
  let code = "";
  // Rejection sampling keeps every letter equally likely (256 isn't a multiple of the alphabet size).
  const limit = 256 - (256 % LINK_CODE_ALPHABET.length);
  while (code.length < LINK_CODE_LENGTH) {
    for (const byte of random(LINK_CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
      if (code.length === LINK_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Whether a string from a URL looks like one of our codes (checked before any database lookup). */
export function isLinkCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

// ─── State ────────────────────────────────────────────────────────────────────

export const PAYMENT_LINK_STATUSES = ["active", "paid", "expired", "cancelled"] as const;
export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];

export const PAYMENT_LINK_CREATORS = ["seller", "peggy_seller", "peggy_customer", "bio"] as const;
export type PaymentLinkCreator = (typeof PAYMENT_LINK_CREATORS)[number];

export interface LinkStateInput {
  status: string;
  oneTime: boolean;
  expiresAt: Date | string | null;
}

/** The status shoppers and sellers see: a saved "active" link past its time reads as expired. */
export function linkStatus(link: LinkStateInput, now = new Date()): PaymentLinkStatus {
  if (link.status === "cancelled") return "cancelled";
  if (link.status === "paid" && link.oneTime) return "paid";
  if (link.status === "expired") return "expired";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export type PayBlock = "paid" | "expired" | "cancelled";

/** Why this link can't be paid now (null when it can). Reusable links stay payable after each sale. */
export function linkPayBlock(link: LinkStateInput, now = new Date()): PayBlock | null {
  const status = linkStatus(link, now);
  return status === "active" ? null : status;
}

export const PAY_BLOCK_MESSAGE: Record<PayBlock, string> = {
  paid: "This payment link has already been paid.",
  expired: "This payment link has expired. Ask the store for a new one.",
  cancelled: "This payment link is no longer available. Ask the store for a new one.",
};

// ─── Items and the buyer's choices ────────────────────────────────────────────

export const MAX_LINK_ITEMS = 10;
export const MAX_LINK_QUANTITY = 50;

export interface LinkItem {
  productId: string;
  /** Fixed option (size, colour…); without it a product with options asks the buyer to choose. */
  variantId?: string | null;
  quantity: number;
  /** Snapshot when the link was made, for the seller's list; checkout always prices from the database. */
  name?: string;
  price?: number;
  image?: string | null;
  variant?: string | null;
}

const LinkItemSchema = z
  .object({
    productId: z.string().min(1).max(64),
    variantId: z.string().max(80).nullable().optional(),
    quantity: z.number().int().min(1).max(MAX_LINK_QUANTITY),
    name: z.string().max(200).optional(),
    price: z.number().nonnegative().optional(),
    image: z.string().max(2000).nullable().optional(),
    variant: z.string().max(120).nullable().optional(),
  })
  .passthrough();

/** The items saved on a link (anything malformed is dropped). */
export function readLinkItems(value: unknown): LinkItem[] {
  if (!Array.isArray(value)) return [];
  const out: LinkItem[] = [];
  for (const entry of value.slice(0, MAX_LINK_ITEMS)) {
    const parsed = LinkItemSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data as LinkItem);
  }
  return out;
}

export interface BuyerChoice {
  /** The option the buyer picked (single-product links whose option isn't fixed). */
  variantId?: string | null;
  /** How many (single-product links without an agreed price). */
  quantity?: number | null;
}

export interface LinkLinesInput {
  items: LinkItem[];
  maxQuantity: number;
  customAmount: number | null;
}

/** Whether the buyer may change the quantity on this link (one product, no agreed price). */
export function buyerSetsQuantity(link: LinkLinesInput) {
  return link.items.length === 1 && link.customAmount == null && link.maxQuantity > 1;
}

/**
 * The bag lines checkout prices for this link and the buyer's choices. Products and fixed options always come from
 * the link; the buyer may only pick an option the link left open, and a quantity within the link's limit. No price
 * is ever taken from the buyer: pricing.server reads it from the database.
 */
export function linkCheckoutLines(link: LinkLinesInput, choice: BuyerChoice = {}): { ok: true; lines: Array<{ productId: string; quantity: number; variantId?: string }> } | { ok: false; message: string } {
  if (!link.items.length) return { ok: false, message: "This payment link has nothing in it. Ask the store for a new one." };
  const single = link.items.length === 1;
  const lines = link.items.map((item) => {
    let quantity = item.quantity;
    if (single && buyerSetsQuantity(link) && typeof choice.quantity === "number" && Number.isInteger(choice.quantity)) {
      quantity = Math.min(Math.max(1, choice.quantity), Math.max(1, link.maxQuantity));
    }
    const variantId = item.variantId || (single ? choice.variantId?.trim() || undefined : undefined);
    return { productId: item.productId, quantity, ...(variantId ? { variantId: variantId.slice(0, 80) } : {}) };
  });
  return { ok: true, lines };
}

/**
 * Spreads an agreed price over the priced lines (in proportion to their prices, the last line taking the rounding),
 * so the order's lines still add up to what the buyer pays. Returns new unit prices per line.
 */
export function spreadAgreedAmount<T extends { price: number; quantity: number }>(lines: T[], amount: number): T[] {
  const total = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const target = Math.max(0, Math.round(amount * 100) / 100);
  if (!lines.length) return lines;
  let left = target;
  return lines.map((line, index) => {
    const last = index === lines.length - 1;
    const lineTotal = last ? left : total > 0 ? Math.round(((line.price * line.quantity) / total) * target * 100) / 100 : index === 0 ? target : 0;
    left = Math.round((left - lineTotal) * 100) / 100;
    const unit = Math.round((lineTotal / line.quantity) * 100) / 100;
    return { ...line, price: unit };
  });
}

// ─── Where the order came from ───────────────────────────────────────────────

const CHAT_CHANNELS: Record<string, string> = { whatsapp: "whatsapp", instagram: "instagram", messenger: "facebook", facebook: "facebook", tiktok: "tiktok", livechat: "online_store" };

/**
 * The order's channel: the chat a link was sent in (WhatsApp, Instagram…), else the app the buyer opened it from
 * (?ref=), else "payment_link".
 */
export function linkOrderChannel(link: { channel?: string | null }, fromRef?: string | null): string {
  const chat = link.channel ? CHAT_CHANNELS[link.channel] : undefined;
  if (chat) return chat;
  if (fromRef && ["whatsapp", "instagram", "facebook", "tiktok"].includes(fromRef)) return fromRef;
  return "payment_link";
}

// ─── Links Peggy makes in customer chats ──────────────────────────────────────

/** Strict limits for links Peggy makes on her own in a WhatsApp or live chat (no seller confirm there). */
export const CUSTOMER_LINK_LIMITS = {
  /** Most of one product a chat link can sell. */
  maxQuantity: 5,
  /** How long a chat link stays open. */
  expiryHours: 24,
  /** New links per conversation per hour. */
  perConversationPerHour: 3,
  /** New chat links per store per hour (all conversations). */
  perStorePerHour: 60,
} as const;

export type CustomerLinkProblem = "not_found" | "not_published" | "rate_limited" | "store_busy";

/** Whether Peggy may make a chat link now. Product checks (own store, published) are done by the caller's query. */
export function customerLinkProblem(input: { productFound: boolean; published: boolean; recentForConversation: number; recentForStore: number }): CustomerLinkProblem | null {
  if (!input.productFound) return "not_found";
  if (!input.published) return "not_published";
  if (input.recentForConversation >= CUSTOMER_LINK_LIMITS.perConversationPerHour) return "rate_limited";
  if (input.recentForStore >= CUSTOMER_LINK_LIMITS.perStorePerHour) return "store_busy";
  return null;
}

/** A chat link's quantity: what the customer asked for, at least 1 and at most the chat limit. */
export function customerLinkQuantity(asked: number | null | undefined) {
  const n = typeof asked === "number" && Number.isFinite(asked) ? Math.floor(asked) : 1;
  return Math.min(Math.max(1, n), CUSTOMER_LINK_LIMITS.maxQuantity);
}

// ─── Creating a link (seller API and Peggy) ───────────────────────────────────

export const EXPIRY_CHOICES = ["1h", "24h", "3d", "7d", "30d", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];
const EXPIRY_HOURS: Record<ExpiryChoice, number | null> = { "1h": 1, "24h": 24, "3d": 72, "7d": 168, "30d": 720, never: null };

/** When a link made now with this choice expires (null = never). */
export function expiryFor(choice: ExpiryChoice | null | undefined, now = new Date()): Date | null {
  const hours = EXPIRY_HOURS[choice ?? "7d"];
  return hours === null ? null : new Date(now.getTime() + hours * 3_600_000);
}

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);

export const CreatePaymentLinkSchema = z
  .object({
    items: z
      .array(z.object({ productId: z.string().trim().min(1).max(64), variantId: z.string().trim().max(80).nullable().optional(), quantity: z.number().int().min(1).max(MAX_LINK_QUANTITY) }).strict())
      .min(1, "Pick at least one product.")
      .max(MAX_LINK_ITEMS, `A link can hold up to ${MAX_LINK_ITEMS} products.`),
    title: optionalText(120),
    note: optionalText(500),
    customAmount: z.number().positive("The amount must be more than 0.").max(100_000_000).nullable().optional(),
    oneTime: z.boolean().default(true),
    expiry: z.enum(EXPIRY_CHOICES).default("7d"),
    maxQuantity: z.number().int().min(1).max(MAX_LINK_QUANTITY).optional(),
    buyerName: optionalText(120),
    buyerPhone: optionalText(40),
    buyerEmail: z.string().trim().max(200).email("That email doesn't look right.").nullable().optional().or(z.literal("")).transform((value) => value || null),
  })
  .strict();
export type CreatePaymentLinkInput = z.infer<typeof CreatePaymentLinkSchema>;

// ─── Sharing ──────────────────────────────────────────────────────────────────

/** The message to send with a link on WhatsApp. */
export function shareMessage(input: { storeName: string; title: string; amount?: string | null; url: string }) {
  return `${input.title}${input.amount ? ` (${input.amount})` : ""} from ${input.storeName}. Pay securely here: ${input.url}`;
}

export function whatsappShareUrl(text: string, phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const to = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** A link's short title: its own, else the products ("Ankara tote", "Ankara tote + 2 more"). */
export function linkTitle(link: { title?: string | null; items: Array<{ name?: string }> }) {
  if (link.title) return link.title;
  const names = link.items.map((item) => item.name).filter(Boolean) as string[];
  if (!names.length) return "Payment";
  return names.length === 1 ? names[0] : `${names[0]} + ${names.length - 1} more`;
}

/** A product as the seller's link dialog shows it: name, price, first photo and the options that are on. */
export function linkProductView(product: { id: string; name: string; retailPrice: number; images: string[]; variants: unknown }) {
  const base = Number(product.retailPrice) || 0;
  return {
    id: product.id,
    name: product.name,
    price: base,
    image: product.images[0] ?? null,
    options: normalizeVariants(product.variants)
      .filter((variant) => variant.enabled)
      .map((variant) => ({ id: variant.id, name: variant.name, price: variantPrice(variant, base) })),
  };
}
