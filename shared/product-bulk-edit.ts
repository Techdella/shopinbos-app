// Editing everything about one or many products from a chat: Peggy's edit_products tool. Pure (no server imports): which
// products a request means, the change as checked input, and the before / after the seller confirms. The tool
// (src/lib/ai/peggy/catalog-tools.ts) loads the products, resolves the category and related products, and saves.
//
// A change leaves a field alone when it is null. An empty text ("") clears a text field; 0 clears the weight and
// the was-price; an empty related list clears related products.

import { z } from "zod";
import { PRODUCT_TYPE_KEYS, productTypeDef, readCustomDetails, readProductDetails, type ProductTypeKey } from "./product-types.ts";
import type { ContentSuggestion } from "./product-content.ts";

/** Products one confirmation may change. */
export const EDIT_MAX_PRODUCTS = 50;

const PRODUCT_REF = z.string().trim().min(1).max(160);

export const EditTargetSchema = z
  .object({
    products: z.array(PRODUCT_REF).min(1).max(EDIT_MAX_PRODUCTS).nullable().describe("Product ids or exact names; null to pick by the filters below"),
    name: z.string().trim().min(1).max(120).nullable().describe("Words the product name contains, e.g. \"lamp\""),
    category: z.string().trim().min(1).max(60).nullable().describe("Category name"),
    tag: z.string().trim().min(1).max(40).nullable(),
    productType: z.enum(PRODUCT_TYPE_KEYS).nullable(),
    batch: z.number().int().min(1).max(40).nullable().describe(`When more than ${EDIT_MAX_PRODUCTS} match: which group of ${EDIT_MAX_PRODUCTS} (1 = first); null for 1`),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.products && !value.name && !value.category && !value.tag && !value.productType) {
      ctx.addIssue({ code: "custom", message: "Say which products: give names or ids, or a name, category, tag or type to match" });
    }
  });
export type EditTarget = z.infer<typeof EditTargetSchema>;

const longText = (max: number, what: string) => z.string().trim().max(max).nullable().describe(`${what}; "" clears it; null keeps it`);

export const ProductChangesSchema = z
  .object({
    description: longText(5000, "Short description shoppers read first"),
    longDescription: longText(20000, "Full description"),
    careInstructions: longText(5000, "Care / how to use"),
    shippingInfo: longText(5000, "Delivery information"),
    returnPolicy: longText(5000, "Returns"),
    warranty: longText(5000, "Warranty, e.g. 12 months"),
    supportInfo: longText(5000, "Support / contact"),
    seoTitle: z.string().trim().max(70).nullable().describe("Google title, under 70 characters"),
    seoDescription: z.string().trim().max(160).nullable().describe("Google description, under 160 characters"),
    specifications: z
      .object({
        mode: z.enum(["replace", "merge"]).describe("replace = these are all the specs; merge = add or change these (value \"\" removes one)"),
        items: z.array(z.object({ name: z.string().trim().min(1).max(100), value: z.string().trim().max(500) }).strict()).max(30),
      })
      .strict()
      .nullable(),
    faqs: z
      .object({
        mode: z.enum(["replace", "add"]),
        items: z.array(z.object({ question: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(2000) }).strict()).max(10),
      })
      .strict()
      .nullable(),
    productType: z.enum(PRODUCT_TYPE_KEYS).nullable().describe("Product type (decides the details asked for)"),
    productDetails: z
      .array(z.object({ key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/), value: z.string().trim().max(1000) }).strict())
      .max(20)
      .nullable()
      .describe("Type details such as material, fit, gender (value \"\" removes)"),
    category: z.string().trim().max(60).nullable().describe("Category name (made if new); \"\" removes the category"),
    tags: z
      .object({ mode: z.enum(["replace", "add", "remove"]), items: z.array(z.string().trim().min(1).max(40)).max(20) })
      .strict()
      .nullable(),
    weight: z.number().min(0).max(100_000).nullable().describe("0 clears it"),
    weightUnit: z.enum(["kg", "g", "lb"]).nullable(),
    dimensions: z
      .object({ length: z.number().positive().max(100_000), width: z.number().positive().max(100_000), height: z.number().positive().max(100_000), unit: z.enum(["cm", "m", "in"]) })
      .strict()
      .nullable(),
    relatedProducts: z.array(PRODUCT_REF).max(8).nullable().describe("Names or ids of the shop's products for \"Customers also like\"; [] clears"),
    compareAtPrice: z.number().min(0).max(100_000_000).nullable().describe("Was-price in naira shown crossed out (above the price); 0 removes it"),
  })
  .strict();
export type ProductChanges = z.infer<typeof ProductChangesSchema>;

export function hasChanges(changes: ProductChanges) {
  return Object.values(changes).some((value) => value !== null);
}

// ─── Which products ──────────────────────────────────────────────────────────

export interface SelectableProduct {
  id: string;
  name: string;
  categoryName?: string | null;
  tags?: string[];
  productType?: string | null;
}

/** One product by id, exact name, or every word of the name. Several matches are returned for the caller to ask. */
export function matchOne<T extends SelectableProduct>(products: T[], ref: string): T[] {
  const q = ref.trim().toLowerCase();
  if (!q) return [];
  const byId = products.filter((p) => p.id === ref.trim());
  if (byId.length) return byId;
  const exact = products.filter((p) => p.name.trim().toLowerCase() === q);
  if (exact.length) return exact;
  const words = q.split(/\s+/);
  return products.filter((p) => words.every((word) => p.name.toLowerCase().includes(word)));
}

export type Selection<T> = { ok: true; products: T[]; total: number; batch: number; batches: number } | { ok: false; error: string };

/** The products a target means (all filters must match), sorted by name, at most EDIT_MAX_PRODUCTS per batch. */
export function selectProducts<T extends SelectableProduct>(products: T[], target: EditTarget): Selection<T> {
  let list = products;
  if (target.products) {
    const picked = new Map<string, T>();
    for (const ref of target.products) {
      const found = matchOne(products, ref);
      if (!found.length) return { ok: false, error: `No product matches "${ref}". Use list_products to find it.` };
      if (found.length > 1) {
        return { ok: false, error: `"${ref}" matches ${found.length} products: ${found.slice(0, 6).map((p) => `${p.name} (id ${p.id})`).join("; ")}. Ask the seller which one, or use the id.` };
      }
      picked.set(found[0]!.id, found[0]!);
    }
    list = [...picked.values()];
  }
  const lower = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
  if (target.name) {
    const words = lower(target.name).split(/\s+/);
    // "lamps" should find "Smart Lamp": a trailing s is optional.
    list = list.filter((p) => words.every((word) => lower(p.name).includes(word) || (word.length > 3 && word.endsWith("s") && lower(p.name).includes(word.slice(0, -1)))));
  }
  if (target.category) {
    const wanted = lower(target.category);
    list = list.filter((p) => lower(p.categoryName) === wanted || (wanted.length > 2 && lower(p.categoryName).includes(wanted)));
  }
  if (target.tag) list = list.filter((p) => (p.tags ?? []).some((tag) => lower(tag) === lower(target.tag)));
  if (target.productType) list = list.filter((p) => (p.productType || "other") === target.productType);
  if (!list.length) return { ok: false, error: "No products match that. Use list_products to see the shop's products." };

  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const batches = Math.ceil(sorted.length / EDIT_MAX_PRODUCTS);
  const batch = Math.min(target.batch ?? 1, batches);
  return { ok: true, products: sorted.slice((batch - 1) * EDIT_MAX_PRODUCTS, batch * EDIT_MAX_PRODUCTS), total: sorted.length, batch, batches };
}

// ─── Applying a change ───────────────────────────────────────────────────────

export interface EditableProduct {
  id: string;
  name: string;
  retailPrice: number;
  description: string | null;
  longDescription: string | null;
  specifications: unknown;
  faqs: unknown;
  careInstructions: string | null;
  shippingInfo: string | null;
  returnPolicy: string | null;
  warranty: string | null;
  supportInfo: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  productType: string | null;
  productDetails: unknown;
  categoryId: string | null;
  categoryName?: string | null;
  tags: string[];
  weight: number | null;
  weightUnit: string | null;
  dimensions: unknown;
  relatedProductIds: string[];
  compareAtPrice: number | null;
}

/** What the tool resolved first: the category ("" / null id = remove it) and the related products. */
export interface ResolvedRefs {
  category?: { id: string | null; name: string | null };
  related?: { id: string; name: string }[];
  /** Names of the shop's products by id, to show the related products before. */
  names?: Map<string, string>;
}

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface AppliedEdit {
  /** Columns to save (Prisma StoreProduct names). Empty when nothing would change. */
  data: Record<string, unknown>;
  diff: FieldDiff[];
  problems: string[];
}

const LABEL: Record<string, string> = {
  description: "Description",
  longDescription: "Full description",
  careInstructions: "Care",
  shippingInfo: "Delivery info",
  returnPolicy: "Returns",
  warranty: "Warranty",
  supportInfo: "Support",
  seoTitle: "SEO title",
  seoDescription: "SEO description",
  specifications: "Specs",
  faqs: "FAQs",
  productType: "Type",
  productDetails: "Details",
  categoryId: "Category",
  tags: "Tags",
  weight: "Weight",
  dimensions: "Size (L × W × H)",
  relatedProductIds: "Customers also like",
  compareAtPrice: "Was-price",
};

export function shorten(value: string | null | undefined, max = 240) {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "(empty)";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function readFaqs(value: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { question, answer } = entry as { question?: unknown; answer?: unknown };
    return typeof question === "string" && typeof answer === "string" && question.trim() && answer.trim() ? [{ question: question.trim(), answer: answer.trim() }] : [];
  });
}

function readDimensions(value: unknown): { length: number; width: number; height: number; unit: string } | null {
  if (!value || typeof value !== "object") return null;
  const { length, width, height, unit } = value as Record<string, unknown>;
  if (typeof length !== "number" || typeof width !== "number" || typeof height !== "number") return null;
  return { length, width, height, unit: typeof unit === "string" ? unit : "cm" };
}

const specsText = (specs: { name: string; value: string }[]) => (specs.length ? specs.map((s) => `${s.name}: ${s.value}`).join("; ") : "(none)");
const faqsText = (faqs: { question: string }[]) => (faqs.length ? `${faqs.length} question${faqs.length === 1 ? "" : "s"}: ${faqs.map((f) => f.question).join(" / ")}` : "(none)");
const dimsText = (d: ReturnType<typeof readDimensions>) => (d ? `${d.length} × ${d.width} × ${d.height} ${d.unit}` : "(empty)");

/**
 * The columns to save and the before / after for one product. Fields already holding the new value are left out,
 * so a change that alters nothing saves nothing.
 */
export function applyProductChanges(product: EditableProduct, changes: ProductChanges, refs: ResolvedRefs = {}): AppliedEdit {
  const data: Record<string, unknown> = {};
  const diff: FieldDiff[] = [];
  const problems: string[] = [];
  const push = (field: string, before: string, after: string) => diff.push({ field: LABEL[field] ?? field, before, after });

  const textFields = ["description", "longDescription", "careInstructions", "shippingInfo", "returnPolicy", "warranty", "supportInfo", "seoTitle", "seoDescription"] as const;
  for (const field of textFields) {
    const next = changes[field];
    if (next === null) continue;
    const before = (product[field] ?? "").trim();
    if (next === before) continue;
    data[field] = next || null;
    push(field, shorten(before), shorten(next));
  }

  // Type and its details. Details for care and warranty live in their own columns.
  const type: ProductTypeKey | null = changes.productType ?? null;
  if (type !== null && (product.productType || "other") !== type) {
    data.productType = type === "other" ? null : type;
    push("productType", productTypeDef(product.productType).label, productTypeDef(type).label);
  }
  if (changes.productDetails) {
    const before = readProductDetails(product.productDetails);
    const next = { ...before };
    const typeDef = productTypeDef(type ?? product.productType);
    for (const { key, value } of changes.productDetails) {
      const column = typeDef.fields.find((field) => field.key === key)?.column ?? (key === "care" ? "careInstructions" : key === "warranty" ? "warranty" : null);
      if (column) {
        if (changes[column] === null && value !== (product[column] ?? "").trim()) {
          data[column] = value || null;
          push(column, shorten(product[column]), shorten(value));
        }
        continue;
      }
      if (value) next[key] = value;
      else delete next[key];
    }
    if (JSON.stringify(next) !== JSON.stringify(before)) {
      data.productDetails = next;
      const label = (key: string) => typeDef.fields.find((field) => field.key === key)?.label ?? key;
      const show = (details: Record<string, string>) => (Object.keys(details).length ? Object.entries(details).map(([k, v]) => `${label(k)}: ${v}`).join("; ") : "(none)");
      push("productDetails", shorten(show(before)), shorten(show(next)));
    }
  }

  if (changes.specifications) {
    const before = readCustomDetails(product.specifications).map((row) => ({ name: row.label, value: row.value }));
    let next: { name: string; value: string }[];
    if (changes.specifications.mode === "replace") next = changes.specifications.items.filter((item) => item.value);
    else {
      next = [...before];
      for (const item of changes.specifications.items) {
        const at = next.findIndex((spec) => spec.name.toLowerCase() === item.name.toLowerCase());
        if (!item.value) { if (at >= 0) next.splice(at, 1); }
        else if (at >= 0) next[at] = { name: next[at]!.name, value: item.value };
        else next.push({ name: item.name, value: item.value });
      }
    }
    const seen = new Set<string>();
    next = next.filter((spec) => !seen.has(spec.name.toLowerCase()) && seen.add(spec.name.toLowerCase())).slice(0, 30);
    if (JSON.stringify(next) !== JSON.stringify(before)) {
      data.specifications = next;
      push("specifications", shorten(specsText(before), 400), shorten(specsText(next), 400));
    }
  }

  if (changes.faqs) {
    const before = readFaqs(product.faqs);
    const next = (changes.faqs.mode === "replace" ? changes.faqs.items : [...before, ...changes.faqs.items.filter((item) => !before.some((f) => f.question.toLowerCase() === item.question.toLowerCase()))]).slice(0, 20);
    if (JSON.stringify(next) !== JSON.stringify(before)) {
      data.faqs = next;
      push("faqs", shorten(faqsText(before), 400), shorten(faqsText(next), 400));
    }
  }

  if (changes.category !== null && refs.category) {
    if ((refs.category.id ?? null) !== (product.categoryId ?? null)) {
      data.categoryId = refs.category.id;
      push("categoryId", product.categoryName || "(none)", refs.category.name || "(none)");
    }
  }

  if (changes.tags) {
    const before = product.tags ?? [];
    const lower = (tag: string) => tag.trim().toLowerCase();
    let next: string[];
    if (changes.tags.mode === "replace") next = changes.tags.items;
    else if (changes.tags.mode === "add") next = [...before, ...changes.tags.items];
    else next = before.filter((tag) => !changes.tags!.items.some((item) => lower(item) === lower(tag)));
    const seen = new Set<string>();
    next = next.map((tag) => tag.trim()).filter((tag) => tag && !seen.has(lower(tag)) && seen.add(lower(tag))).slice(0, 30);
    if (JSON.stringify(next) !== JSON.stringify(before)) {
      data.tags = next;
      push("tags", before.join(", ") || "(none)", next.join(", ") || "(none)");
    }
  }

  if (changes.weight !== null || changes.weightUnit !== null) {
    const unit = changes.weightUnit ?? product.weightUnit ?? "kg";
    const weight = changes.weight === null ? product.weight : changes.weight || null;
    if (weight !== product.weight || unit !== (product.weightUnit ?? "kg")) {
      data.weight = weight;
      data.weightUnit = unit;
      push("weight", product.weight ? `${product.weight} ${product.weightUnit ?? "kg"}` : "(empty)", weight ? `${weight} ${unit}` : "(empty)");
    }
  }

  if (changes.dimensions) {
    const before = readDimensions(product.dimensions);
    if (JSON.stringify(before) !== JSON.stringify(changes.dimensions)) {
      data.dimensions = changes.dimensions;
      push("dimensions", dimsText(before), dimsText(changes.dimensions));
    }
  }

  if (changes.relatedProducts !== null && refs.related) {
    const ids = refs.related.map((item) => item.id).filter((id) => id !== product.id).slice(0, 8);
    if (JSON.stringify(ids) !== JSON.stringify(product.relatedProductIds ?? [])) {
      data.relatedProductIds = ids;
      const name = (id: string) => refs.names?.get(id) ?? refs.related?.find((item) => item.id === id)?.name ?? id;
      push("relatedProductIds", (product.relatedProductIds ?? []).map(name).join(", ") || "(none)", ids.map(name).join(", ") || "(none)");
    }
  }

  if (changes.compareAtPrice !== null) {
    const next = changes.compareAtPrice || null;
    if (next !== null && next <= product.retailPrice) problems.push(`${product.name}: the was-price ${naira(next)} must be above the price ${naira(product.retailPrice)}, so it was left out`);
    else if (next !== (product.compareAtPrice ?? null)) {
      data.compareAtPrice = next;
      push("compareAtPrice", product.compareAtPrice ? naira(product.compareAtPrice) : "(none)", next ? naira(next) : "(none)");
    }
  }

  return { data, diff, problems };
}

/** The preview the seller confirms: each product with its before → after lines. */
export function editPreview(edits: Array<{ name: string; diff: FieldDiff[] }>, maxProducts = 15) {
  const changed = edits.filter((edit) => edit.diff.length);
  const lines = changed.slice(0, maxProducts).map((edit) => `${edit.name}:\n${edit.diff.map((d) => `  - ${d.field}: ${d.before} → ${d.after}`).join("\n")}`);
  if (changed.length > maxProducts) lines.push(`…and ${changed.length - maxProducts} more product${changed.length - maxProducts === 1 ? "" : "s"} with the same kind of change.`);
  return lines.join("\n");
}

/** The parts a product-edit confirmation code is tied to: exactly these products and exactly these changes. */
export function editConfirmationParts(storeId: string, productIds: string[], changes: unknown) {
  return [storeId, "edit-products", [...productIds].sort().join(","), stableJson(changes)];
}

/** JSON with object keys sorted, so the same change always gives the same code. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Content Peggy wrote for one product as an edit_products change: specs, FAQs and tags are added, the rest set. */
export function suggestionToChanges(suggestion: ContentSuggestion): ProductChanges {
  return {
    description: suggestion.description ?? null,
    longDescription: suggestion.longDescription ?? null,
    careInstructions: suggestion.careInstructions ?? null,
    shippingInfo: null,
    returnPolicy: null,
    warranty: null,
    supportInfo: null,
    seoTitle: suggestion.seoTitle ?? null,
    seoDescription: suggestion.seoDescription ?? null,
    specifications: suggestion.specifications?.length ? { mode: "merge", items: suggestion.specifications } : null,
    faqs: suggestion.faqs?.length ? { mode: "add", items: suggestion.faqs } : null,
    productType: suggestion.productType ?? null,
    productDetails: suggestion.productDetails ? Object.entries(suggestion.productDetails).map(([key, value]) => ({ key, value })) : null,
    category: suggestion.category ?? null,
    tags: suggestion.tags?.length ? { mode: "add", items: suggestion.tags } : null,
    weight: null,
    weightUnit: null,
    dimensions: null,
    relatedProducts: null,
    compareAtPrice: null,
  };
}

/** "Home & Kitchen" → "home-kitchen" (category slugs). */
export function categorySlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
