// Product content Peggy writes: descriptions, specs, FAQs, SEO, care, tags, category and product type, for one
// product or a batch (Peggy's draft_product_content tool and the "Let Peggy check and fill in" step of the bulk
// import). Pure, so the server, the import screen and tests share it.
//
// AI replies are never trusted as they come: sanitizeContent checks every field on its own and drops what is the
// wrong shape, so one bad field doesn't lose the rest. Without an AI key, ruleBasedContent still fills the basics
// from the product's own columns.

import { z } from "zod";
import { PRODUCT_TYPE_KEYS, guessProductType, productTypeDef, readProductDetails, type ProductTypeKey } from "./product-types.ts";

export const CONTENT_FIELDS = ["description", "longDescription", "specifications", "faqs", "seo", "care", "tags", "category", "productType"] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

/** Products per AI call, and per call when photos go along (a call carries at most 4 photos). */
export const CONTENT_BATCH = 5;
export const CONTENT_BATCH_WITH_PHOTOS = 4;

export interface ContentSource {
  name: string;
  description?: string | null;
  category?: string | null;
  productType?: string | null;
  price?: number | null;
  tags?: string[];
  specifications?: { name: string; value: string }[];
  /** A public https photo of the product, shown to the model when vision is on. */
  imageUrl?: string | null;
}

export interface ContentSuggestion {
  description?: string;
  longDescription?: string;
  specifications?: { name: string; value: string }[];
  faqs?: { question: string; answer: string }[];
  seoTitle?: string;
  seoDescription?: string;
  careInstructions?: string;
  tags?: string[];
  category?: string;
  productType?: ProductTypeKey;
  productDetails?: Record<string, string>;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const SpecSchema = z.object({ name: text(100), value: text(500) });
const FaqSchema = z.object({ question: text(500), answer: text(2000) });

/** Each field checked on its own (lengths as the product API saves them). */
const FIELD_SCHEMAS = {
  description: text(5000),
  longDescription: text(20000),
  specifications: z.array(SpecSchema).max(30),
  faqs: z.array(FaqSchema).max(10),
  seoTitle: text(70),
  seoDescription: text(160),
  careInstructions: text(5000),
  tags: z.array(text(40)).max(20),
  category: text(60),
  productType: z.enum(PRODUCT_TYPE_KEYS),
} as const;

/** Shortens a string at a word boundary (SEO fields the model wrote a little too long are still useful). */
export function clip(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/**
 * A model's suggestion for one product, checked field by field. Unknown keys and wrong shapes are dropped; SEO
 * fields that run long are clipped; specs, FAQs and tags keep only their valid entries.
 */
export function sanitizeContent(raw: unknown): ContentSuggestion {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: ContentSuggestion = {};
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : undefined);

  for (const key of ["description", "longDescription", "careInstructions", "category"] as const) {
    const parsed = FIELD_SCHEMAS[key].safeParse(str(key));
    if (parsed.success) out[key] = parsed.data;
  }
  if (str("seoTitle")?.trim()) out.seoTitle = clip(str("seoTitle")!, 70);
  if (str("seoDescription")?.trim()) out.seoDescription = clip(str("seoDescription")!, 160);
  const type = FIELD_SCHEMAS.productType.safeParse(typeof input.productType === "string" ? input.productType.trim().toLowerCase() : undefined);
  if (type.success) out.productType = type.data;

  const list = <T>(value: unknown, schema: z.ZodType<T>, max: number) =>
    Array.isArray(value) ? value.flatMap((entry) => { const parsed = schema.safeParse(entry); return parsed.success ? [parsed.data] : []; }).slice(0, max) : [];
  const specs = list(input.specifications, SpecSchema, 30);
  if (specs.length) out.specifications = dedupeSpecs(specs);
  const faqs = list(input.faqs, FaqSchema, 10);
  if (faqs.length) out.faqs = faqs;
  const tags = list(input.tags, text(40), 20);
  if (tags.length) out.tags = dedupeWords(tags);

  if (input.productDetails && typeof input.productDetails === "object") {
    const details = readProductDetails(input.productDetails);
    // Only keys the product type asks for (care and warranty live in their own columns).
    const allowed = new Set(productTypeDef(out.productType ?? null).fields.filter((field) => !field.column).map((field) => field.key));
    const kept = Object.fromEntries(Object.entries(details).filter(([key]) => allowed.has(key)));
    if (Object.keys(kept).length) out.productDetails = kept;
  }
  return out;
}

export function dedupeSpecs(specs: { name: string; value: string }[]) {
  const seen = new Set<string>();
  return specs.filter((spec) => {
    const key = spec.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeWords(words: string[]) {
  const seen = new Set<string>();
  return words.map((word) => word.trim()).filter((word) => {
    const key = word.toLowerCase();
    if (!word || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The suggestions in a model reply for a batch of `count` products: { products: [{ index, ... }] } (or a bare
 * array). Entries are matched by index (1-based, as the prompt numbers them); anything missing is null.
 */
export function parseContentReply(json: unknown, count: number): Array<ContentSuggestion | null> {
  const list = Array.isArray(json) ? json : json && typeof json === "object" && Array.isArray((json as { products?: unknown }).products) ? (json as { products: unknown[] }).products : [];
  const out: Array<ContentSuggestion | null> = Array.from({ length: count }, () => null);
  list.forEach((entry, position) => {
    if (!entry || typeof entry !== "object") return;
    // An entry with an index goes to that product (or nowhere if the index is wrong); without one, by position.
    const given = (entry as { index?: unknown }).index;
    const index = Number(given);
    const slot = given === undefined ? (position < count ? position : -1) : Number.isInteger(index) && index >= 1 && index <= count ? index - 1 : -1;
    if (slot < 0 || out[slot]) return;
    const suggestion = sanitizeContent(entry);
    out[slot] = Object.keys(suggestion).length ? suggestion : null;
  });
  return out;
}

const FIELD_BRIEF: Record<ContentField, string> = {
  description: '"description": 2-4 short sentences a shopper reads first, then up to 4 short lines starting with "- " for key points',
  longDescription: '"longDescription": 2-4 paragraphs with more detail (use, sizing, why it is good)',
  specifications: '"specifications": [{"name","value"}] facts such as Material, Size, Colour, Power, Capacity, Brand (only what you can see or were told)',
  faqs: '"faqs": 3-5 [{"question","answer"}] shoppers in Nigeria often ask (delivery and returns answers only say "message us" unless told)',
  seo: '"seoTitle" (under 60 characters) and "seoDescription" (under 155 characters) for Google',
  care: '"careInstructions": 1-3 short lines on care or use (empty when not relevant, e.g. food or digital)',
  tags: '"tags": 3-8 short lower-case search words',
  category: '"category": one shop category name (2-3 words, Title Case); reuse one of the existing categories when it fits',
  productType: `"productType": one of ${PRODUCT_TYPE_KEYS.join(", ")}, and "productDetails": {key: value} for that type's details you can tell`,
};

export function contentSystemPrompt(storeName: string) {
  return `You write product listings for ${storeName}, a small online shop in Nigeria. Clear, warm, plain English shoppers trust. Use standard shop words. Never invent prices, discounts, delivery times, guarantees, certifications, brand names or materials you were not given or cannot see in the photo; leave a field out instead. No emojis. Return JSON only.`;
}

const DETAIL_KEYS = PRODUCT_TYPE_KEYS.map((key) => {
  const fields = productTypeDef(key).fields.filter((field) => !field.column).map((field) => field.key);
  return fields.length ? `${key}: ${fields.join(", ")}` : "";
}).filter(Boolean).join("; ");

/** The prompt for one batch. Photos are attached in the order of the products that have `hasPhoto`. */
export function contentUserPrompt(items: Array<ContentSource & { hasPhoto?: boolean }>, fields: readonly ContentField[], opts: { categories?: string[]; instruction?: string | null } = {}) {
  let photo = 0;
  const lines = items.map((item, i) => {
    const facts = [
      `${i + 1}. ${item.name}`,
      item.price ? `price ${item.price}` : "",
      item.category ? `category: ${item.category}` : "",
      item.productType ? `type: ${item.productType}` : "",
      item.tags?.length ? `tags: ${item.tags.slice(0, 10).join(", ")}` : "",
      item.specifications?.length ? `details: ${item.specifications.slice(0, 15).map((s) => `${s.name}: ${s.value}`).join("; ")}` : "",
      item.description ? `current description: ${item.description.replace(/\s+/g, " ").slice(0, 600)}` : "",
      item.hasPhoto ? `(photo ${++photo} is this product)` : "",
    ].filter(Boolean);
    return facts.join(" | ");
  });
  return [
    `Products:\n${lines.join("\n")}`,
    opts.categories?.length ? `Existing shop categories: ${opts.categories.slice(0, 60).join(", ")}` : "",
    opts.instruction ? `The seller asked: ${opts.instruction.slice(0, 500)}` : "",
    `For each product write: ${fields.map((field) => FIELD_BRIEF[field]).join("; ")}.`,
    fields.includes("productType") ? `Detail keys per type: ${DETAIL_KEYS}.` : "",
    'Return JSON only: {"products": [{"index": 1, ...the fields}, ...]} with one entry per product, in order.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Keeps only the fields the seller asked for (seo covers both SEO fields, productType its details too). */
export function pickFields(suggestion: ContentSuggestion, fields: readonly ContentField[]): ContentSuggestion {
  const want = new Set(fields);
  const out: ContentSuggestion = {};
  if (want.has("description") && suggestion.description) out.description = suggestion.description;
  if (want.has("longDescription") && suggestion.longDescription) out.longDescription = suggestion.longDescription;
  if (want.has("specifications") && suggestion.specifications) out.specifications = suggestion.specifications;
  if (want.has("faqs") && suggestion.faqs) out.faqs = suggestion.faqs;
  if (want.has("seo")) {
    if (suggestion.seoTitle) out.seoTitle = suggestion.seoTitle;
    if (suggestion.seoDescription) out.seoDescription = suggestion.seoDescription;
  }
  if (want.has("care") && suggestion.careInstructions) out.careInstructions = suggestion.careInstructions;
  if (want.has("tags") && suggestion.tags) out.tags = suggestion.tags;
  if (want.has("category") && suggestion.category) out.category = suggestion.category;
  if (want.has("productType") && suggestion.productType) {
    out.productType = suggestion.productType;
    if (suggestion.productDetails) out.productDetails = suggestion.productDetails;
  }
  return out;
}

function titleCase(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * The no-AI suggestion: product type guessed from the name and category, the sheet's own columns as specs, the
 * category and brand as tags, an SEO title and description from the name and description, and a plain
 * description from the details when the row has none.
 */
export function ruleBasedContent(item: ContentSource, fields: readonly ContentField[] = CONTENT_FIELDS): ContentSuggestion {
  const out: ContentSuggestion = {};
  const specs = dedupeSpecs((item.specifications ?? []).filter((spec) => spec.name.trim() && spec.value.trim()).map((spec) => ({ name: spec.name.trim().slice(0, 100), value: spec.value.trim().slice(0, 500) })));
  const type = guessProductType(`${item.category ?? ""} ${item.name}`) ?? guessProductType(item.name);
  if (type) out.productType = type;
  if (specs.length) out.specifications = specs.slice(0, 30);
  if (item.category?.trim()) out.category = titleCase(item.category).slice(0, 60);
  const tags = dedupeWords([item.category ?? "", ...(item.tags ?? [])].map((tag) => tag.toLowerCase().slice(0, 40))).slice(0, 20);
  if (tags.length) out.tags = tags;
  out.seoTitle = clip(item.name, 70);
  const plain = (item.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain) out.seoDescription = clip(plain, 160);
  else if (specs.length) out.seoDescription = clip(`${item.name}. ${specs.slice(0, 3).map((s) => `${s.name}: ${s.value}`).join(". ")}.`, 160);
  if (!plain && specs.length) {
    out.description = `${item.name}.\n${specs.slice(0, 6).map((s) => `- ${s.name}: ${s.value}`).join("\n")}`.slice(0, 5000);
  }
  return pickFields(out, fields);
}

// ─── Bulk import: what the seller accepted ───────────────────────────────────

/** The most products Peggy writes for with AI in one import; the rest get the rule-based fill. */
export const IMPORT_AI_MAX_ROWS = 60;

/** One row's accepted (maybe edited) suggestion, as the import route receives it. Empty values are left out. */
export const ImportEnhancementSchema = z
  .object({
    description: z.string().trim().max(5000).optional(),
    longDescription: z.string().trim().max(20000).optional(),
    specifications: z.array(z.object({ name: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(500) }).strict()).max(30).optional(),
    faqs: z.array(z.object({ question: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(2000) }).strict()).max(10).optional(),
    seoTitle: z.string().trim().max(70).optional(),
    seoDescription: z.string().trim().max(160).optional(),
    careInstructions: z.string().trim().max(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    category: z.string().trim().max(60).optional(),
    productType: z.enum(PRODUCT_TYPE_KEYS).optional(),
    productDetails: z.record(z.string(), z.string().max(1000)).optional(),
  })
  .strict();
export type ImportEnhancement = z.infer<typeof ImportEnhancementSchema>;

/** { "<row index>": enhancement } for the rows the seller accepted. */
export const ImportEnhancementsSchema = z
  .record(z.string().regex(/^\d{1,4}$/), ImportEnhancementSchema)
  .refine((value) => Object.keys(value).length <= 2000, "Too many rows");

/** The import's columns for one product with the accepted suggestion on top (the seller saw and kept it). */
export function mergeEnhancement<T extends { description: string | null; tags: string[]; specifications: { name: string; value: string }[] }>(product: T, enhancement: ImportEnhancement | undefined) {
  if (!enhancement) return { ...product, extra: {} as Record<string, unknown>, categoryName: null as string | null };
  const extra: Record<string, unknown> = {};
  if (enhancement.longDescription) extra.longDescription = enhancement.longDescription;
  if (enhancement.faqs?.length) extra.faqs = enhancement.faqs;
  if (enhancement.seoTitle) extra.seoTitle = enhancement.seoTitle;
  if (enhancement.seoDescription) extra.seoDescription = enhancement.seoDescription;
  if (enhancement.careInstructions) extra.careInstructions = enhancement.careInstructions;
  if (enhancement.productType) extra.productType = enhancement.productType === "other" ? null : enhancement.productType;
  if (enhancement.productDetails) {
    const details = readProductDetails(enhancement.productDetails);
    if (Object.keys(details).length) extra.productDetails = details;
  }
  return {
    ...product,
    description: enhancement.description || product.description,
    specifications: enhancement.specifications ? dedupeSpecs(enhancement.specifications) : product.specifications,
    tags: enhancement.tags ? dedupeWords(enhancement.tags).slice(0, 20) : product.tags,
    extra,
    categoryName: enhancement.category?.trim() || null,
  };
}

/** A suggestion as the enhancement the import saves (empty fields dropped). */
export function toEnhancement(suggestion: ContentSuggestion): ImportEnhancement {
  const out: ImportEnhancement = {};
  if (suggestion.description?.trim()) out.description = suggestion.description.trim();
  if (suggestion.longDescription?.trim()) out.longDescription = suggestion.longDescription.trim();
  if (suggestion.specifications?.length) out.specifications = suggestion.specifications;
  if (suggestion.faqs?.length) out.faqs = suggestion.faqs;
  if (suggestion.seoTitle?.trim()) out.seoTitle = clip(suggestion.seoTitle, 70);
  if (suggestion.seoDescription?.trim()) out.seoDescription = clip(suggestion.seoDescription, 160);
  if (suggestion.careInstructions?.trim()) out.careInstructions = suggestion.careInstructions.trim();
  if (suggestion.tags?.length) out.tags = suggestion.tags;
  if (suggestion.category?.trim()) out.category = suggestion.category.trim().slice(0, 60);
  if (suggestion.productType) out.productType = suggestion.productType;
  if (suggestion.productDetails && Object.keys(suggestion.productDetails).length) out.productDetails = suggestion.productDetails;
  return out;
}

/** The AI suggestion with rule-based values filling what it left out. */
export function withRuleFallback(ai: ContentSuggestion | null, rules: ContentSuggestion): ContentSuggestion {
  return { ...rules, ...(ai ?? {}) };
}
