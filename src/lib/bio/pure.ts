// Link in bio (https://<store>/links): the blocks a seller can add, their checks, the theme presets, and the links
// each block opens. Pure (zod only), so tests/payment-links.test.mjs loads it directly; the editor, the public page,
// the save API and Peggy all use these.

import { z } from "zod";

export const MAX_BIO_BLOCKS = 30;

export const SOCIAL_KEYS = ["instagram", "tiktok", "whatsapp", "x", "facebook", "youtube"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  x: "X",
  facebook: "Facebook",
  youtube: "YouTube",
};

const WHATSAPP_MESSAGE = "Enter a WhatsApp number like +2348012345678.";

const id = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const label = (max = 80) => z.string().trim().max(max);

/** Only web links (http/https), so a block can't run script or open an app scheme. */
export const SafeUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      // A real host: "https://" or a half-typed "https://shop" is not a page anyone can open.
      return (url.protocol === "https:" || url.protocol === "http:") && /^[^.]+(\.[^.]+)+$/.test(url.hostname);
    } catch {
      return false;
    }
  }, "Enter a full web address starting with https://");

const ProductBlock = z
  .object({
    id,
    type: z.literal("product"),
    productId: z.string().trim().min(1, "Choose a product, or remove the block.").max(64),
    /** page = open the product page; pay = open a reusable payment link ("Buy now"). */
    action: z.enum(["page", "pay"]).default("page"),
    /** Big "Buy now" style card. */
    featured: z.boolean().default(false),
    label: label().optional(),
    /** Set by the server when action is pay: the reusable link's code. */
    payCode: z.string().max(24).optional(),
  })
  .strict();

const CollectionBlock = z.object({ id, type: z.literal("collection"), collectionId: z.string().trim().min(1, "Choose a collection, or remove the block.").max(64), label: label().optional() }).strict();
const LinkBlock = z.object({ id, type: z.literal("link"), label: label().min(1, "Give the link a name."), url: SafeUrl }).strict();
const SocialsBlock = z
  .object({
    id,
    type: z.literal("socials"),
    links: z.object(Object.fromEntries(SOCIAL_KEYS.map((key) => [key, z.string().trim().max(200).optional()])) as Record<SocialKey, z.ZodOptional<z.ZodString>>).strict(),
  })
  .strict();
const WhatsappBlock = z
  .object({
    id,
    type: z.literal("whatsapp"),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{7,20}$/, WHATSAPP_MESSAGE)
      .refine((value) => value.replace(/\D/g, "").length >= 7, WHATSAPP_MESSAGE),
    label: label().optional(),
    message: label(300).optional(),
  })
  .strict();
const SignupBlock = z.object({ id, type: z.literal("signup"), title: label(120).optional(), buttonLabel: label(40).optional() }).strict();
const TextBlock = z.object({ id, type: z.literal("text"), text: z.string().trim().min(1, "Write the text, or remove the block.").max(500) }).strict();

/** The big "Shop now" button: opens the store's home page, styled as the page's main button. */
const ShopBlock = z.object({ id, type: z.literal("shop"), label: label(40).optional() }).strict();
/** "New arrivals": the store's newest published products as a 2×2 grid (picked by the server when the page loads). */
const ArrivalsBlock = z.object({ id, type: z.literal("arrivals"), label: label(40).optional() }).strict();
/** "Track my order": the store's order lookup (order number + email or phone), then the order's own page. */
const TrackBlock = z.object({ id, type: z.literal("track"), label: label(40).optional() }).strict();

export const BioBlockSchema = z.discriminatedUnion("type", [ProductBlock, CollectionBlock, LinkBlock, SocialsBlock, WhatsappBlock, SignupBlock, TextBlock, ShopBlock, ArrivalsBlock, TrackBlock]);
export type BioBlock = z.infer<typeof BioBlockSchema>;
export type BioBlockType = BioBlock["type"];
export const BIO_BLOCK_TYPES: BioBlockType[] = ["product", "collection", "link", "socials", "whatsapp", "signup", "text", "shop", "arrivals", "track"];

/** How many products the "New arrivals" grid shows (2×2). */
export const ARRIVALS_COUNT = 4;

/** The words a shop, arrivals or track block shows when the seller left its label empty. */
export const BIO_BLOCK_DEFAULT_LABEL = { shop: "Shop now", arrivals: "New arrivals", track: "Track my order" } as const;

/** A shop, arrivals or track block's words: the seller's label, else the default for its type. */
export function bioBlockLabel(block: { type: "shop" | "arrivals" | "track"; label?: string }) {
  return block.label?.trim() || BIO_BLOCK_DEFAULT_LABEL[block.type];
}

/**
 * The products "New arrivals" shows: published ones only, newest first, at most ARRIVALS_COUNT (ties keep the order
 * they came in).
 */
export function newestProducts<T extends { status?: string | null; createdAt: Date | string }>(products: readonly T[], count = ARRIVALS_COUNT): T[] {
  return products
    .map((product, index) => ({ product, index, at: new Date(product.createdAt).getTime() || 0 }))
    .filter(({ product }) => product.status === undefined || product.status === "published")
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .slice(0, Math.max(0, count))
    .map(({ product }) => product);
}

export const BIO_PRESETS = {
  classic: { label: "Classic", background: "#FAF7F1", text: "#16141F", button: "#16141F", buttonText: "#FFFFFF" },
  mint: { label: "Mint", background: "#E8F7F3", text: "#0E2A38", button: "#2E7E78", buttonText: "#FFFFFF" },
  night: { label: "Night", background: "#0E2A38", text: "#F4F1EA", button: "#73D8C8", buttonText: "#0E2A38" },
  sunset: { label: "Sunset", background: "#FFF1E8", text: "#3A1F14", button: "#E86A4F", buttonText: "#FFFFFF" },
  gold: { label: "Gold", background: "#16141F", text: "#F6E7C1", button: "#F2A93B", buttonText: "#16141F" },
  store: { label: "My store's colours", background: "", text: "", button: "", buttonText: "" },
} as const;
export type BioPreset = keyof typeof BIO_PRESETS;
export const BIO_PRESET_KEYS = Object.keys(BIO_PRESETS) as BioPreset[];

const colour = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Colours are like #16141F.");

export const BioThemeSchema = z
  .object({
    preset: z.enum(BIO_PRESET_KEYS as [BioPreset, ...BioPreset[]]).default("store"),
    background: colour.optional(),
    text: colour.optional(),
    button: colour.optional(),
    buttonText: colour.optional(),
  })
  .strict();
export type BioTheme = z.infer<typeof BioThemeSchema>;

export const BioPageSchema = z
  .object({
    published: z.boolean().default(true),
    title: label(80).optional().nullable(),
    bio: z.string().trim().max(300).optional().nullable(),
    avatarUrl: SafeUrl.optional().nullable().or(z.literal("")),
    theme: BioThemeSchema.default({ preset: "store" }),
    blocks: z.array(BioBlockSchema).max(MAX_BIO_BLOCKS, `A page can have up to ${MAX_BIO_BLOCKS} blocks.`),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.blocks.forEach((block, index) => {
      if (seen.has(block.id)) ctx.addIssue({ code: "custom", message: "Each block needs its own id.", path: ["blocks", index, "id"] });
      seen.add(block.id);
    });
  });
export type BioPageInput = z.infer<typeof BioPageSchema>;

/** The saved blocks (anything malformed is dropped rather than breaking the page). */
export function readBioBlocks(value: unknown): BioBlock[] {
  if (!Array.isArray(value)) return [];
  const out: BioBlock[] = [];
  for (const entry of value.slice(0, MAX_BIO_BLOCKS)) {
    const parsed = BioBlockSchema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function readBioTheme(value: unknown): BioTheme {
  const parsed = BioThemeSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { preset: "store" };
}

/** The page's colours: the preset's, any custom colour on top, or the store's own (passed in) for "store". */
export function bioColours(theme: BioTheme, store: { background: string; text: string; button: string; buttonText: string }) {
  const preset = theme.preset === "store" ? store : BIO_PRESETS[theme.preset];
  return {
    background: theme.background ?? preset.background,
    text: theme.text ?? preset.text,
    button: theme.button ?? preset.button,
    buttonText: theme.buttonText ?? preset.buttonText,
  };
}

// ─── Where blocks go ──────────────────────────────────────────────────────────

function digits(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `234${d.slice(1)}` : d;
}

export function whatsappChatUrl(phone: string, message?: string) {
  return `https://wa.me/${digits(phone)}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** A social handle or link as a full https link (handles like "@adafabrics" become profile links). */
export function socialUrl(key: SocialKey, value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return SafeUrl.safeParse(raw).success ? raw : null;
  if (key === "whatsapp") return digits(raw).length >= 7 ? whatsappChatUrl(raw) : null;
  const handle = raw.replace(/^@/, "").replace(/[^A-Za-z0-9._-]/g, "");
  if (!handle) return null;
  switch (key) {
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "facebook":
      return `https://facebook.com/${handle}`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    default:
      return null;
  }
}

/** A new block id (short, unique enough within one page). */
export function newBlockId(random = Math.random) {
  return `b${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
}

/**
 * A starter page (also what Peggy builds): the shop's top products as cards (the first one a featured "Buy now"),
 * a WhatsApp button and the socials the seller has.
 */
export function starterBlocks(input: { productIds: string[]; whatsapp?: string | null; socials?: Partial<Record<SocialKey, string>>; buyNow?: boolean; signup?: boolean; shopButtons?: boolean }, random = Math.random): BioBlock[] {
  const blocks: BioBlock[] = [];
  // The editor's starter (shopButtons): "Shop now" and "New arrivals" on top, "Track my order" last, like the default page.
  const shopButtons = Boolean(input.shopButtons && input.productIds.length);
  if (shopButtons) blocks.push({ id: newBlockId(random), type: "shop" }, { id: newBlockId(random), type: "arrivals" });
  input.productIds.slice(0, 12).forEach((productId, index) => {
    blocks.push({ id: newBlockId(random), type: "product", productId, action: input.buyNow !== false && index === 0 ? "pay" : "page", featured: index === 0 });
  });
  if (input.whatsapp && digits(input.whatsapp).length >= 7) blocks.push({ id: newBlockId(random), type: "whatsapp", phone: input.whatsapp, label: "Chat with us on WhatsApp" });
  const socials = Object.fromEntries(Object.entries(input.socials ?? {}).filter(([, value]) => value && String(value).trim())) as Partial<Record<SocialKey, string>>;
  if (Object.keys(socials).length) blocks.push({ id: newBlockId(random), type: "socials", links: socials });
  if (input.signup) blocks.push({ id: newBlockId(random), type: "signup", title: "Get our new arrivals first" });
  if (shopButtons) blocks.push({ id: newBlockId(random), type: "track" });
  return blocks;
}

// ─── Checks the editor shows before saving ────────────────────────────────────

/** Which part of a block needs the seller's attention. The editor words each one (paylinks fix.*). */
export type BioProblemField = "label" | "url" | "phone" | "text" | "productId" | "collectionId" | "other";

export interface BioBlockProblem {
  index: number;
  blockId: string;
  type: BioBlockType | "unknown";
  field: BioProblemField;
  /** The schema's own words (English), for the API's error message and Peggy. */
  message: string;
}

const PROBLEM_FIELDS = new Set<BioProblemField>(["label", "url", "phone", "text", "productId", "collectionId"]);

function problemField(path: PropertyKey | undefined): BioProblemField {
  return typeof path === "string" && PROBLEM_FIELDS.has(path as BioProblemField) ? (path as BioProblemField) : "other";
}

/**
 * Every field that would stop the page saving, block by block, checked with the same schema the server uses (so
 * the editor never sends a page the server refuses for these reasons). When the lists the seller can pick from
 * are given, products and collections must be in them too. At most one problem per field.
 */
export function bioBlockProblems(blocks: readonly unknown[], known?: { productIds?: Iterable<string>; collectionIds?: Iterable<string> }): BioBlockProblem[] {
  const products = known?.productIds ? new Set(known.productIds) : null;
  const collections = known?.collectionIds ? new Set(known.collectionIds) : null;
  const out: BioBlockProblem[] = [];
  blocks.forEach((raw, index) => {
    const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const type = (BIO_BLOCK_TYPES as string[]).includes(String(entry.type)) ? (entry.type as BioBlockType) : "unknown";
    const blockId = typeof entry.id === "string" ? entry.id : "";
    const seen = new Set<BioProblemField>();
    const push = (field: BioProblemField, message: string) => {
      if (seen.has(field)) return;
      seen.add(field);
      out.push({ index, blockId, type, field, message });
    };
    const parsed = BioBlockSchema.safeParse(raw);
    if (!parsed.success) for (const issue of parsed.error.issues) push(problemField(issue.path[0]), issue.message);
    if (type === "product" && products && typeof entry.productId === "string" && entry.productId && !products.has(entry.productId)) push("productId", "Choose a published product, or remove the block.");
    if (type === "collection" && collections && typeof entry.collectionId === "string" && entry.collectionId && !collections.has(entry.collectionId)) push("collectionId", "Choose a collection, or remove the block.");
  });
  return out;
}

/** Where a page-level zod issue points: blocks[i].field gives { index, field }; anything else null. */
export function bioIssueTarget(path: readonly PropertyKey[]): { index: number; field: BioProblemField } | null {
  if (path[0] !== "blocks" || typeof path[1] !== "number") return null;
  return { index: path[1], field: problemField(path[2]) };
}

/**
 * What a live store's /links shows before the seller has saved a page of their own (and what the editor opens
 * with): "Shop now", the "New arrivals" grid, their top 3 products (the first as a big card), a WhatsApp button when
 * the shop has a number, and "Track my order". A shop with no products yet gets only the WhatsApp button. Fixed ids,
 * so the editor and the page agree.
 */
export function defaultBioBlocks(input: { productIds: string[]; whatsapp?: string | null }): BioBlock[] {
  const sells = input.productIds.length > 0;
  const blocks: BioBlock[] = sells ? [{ id: "auto-shop", type: "shop" }, { id: "auto-arrivals", type: "arrivals" }] : [];
  blocks.push(...input.productIds.slice(0, 3).map((productId, index): BioBlock => ({ id: `auto-product-${index + 1}`, type: "product", productId, action: "page", featured: index === 0 })));
  const phone = input.whatsapp?.trim();
  if (phone && digits(phone).length >= 7) blocks.push({ id: "auto-whatsapp", type: "whatsapp", phone: phone.startsWith("+") ? phone : `+${digits(phone)}`, label: "Chat with us on WhatsApp" });
  if (sells) blocks.push({ id: "auto-track", type: "track" });
  return blocks;
}
