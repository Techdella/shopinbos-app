// Everything else on the web product form (src/app/components/ProductForm.tsx), for the phone's product editor
// (app/product/[id].tsx): long description, specifications, questions buyers ask, care / delivery / returns /
// warranty / support, tags, codes, cost, weight, stock settings, search (SEO) text, and adding or removing sizes and
// colours. Pure (no React Native) so tests/mobile-product-more.test.mjs runs it in Node. Saved with the same
// PATCH /api/store/products/[id] and StoreProductUpdateSchema limits as the web form; only changed fields are sent.

import { amountText, parseNaira, parseWholeNumber, variantUpdatesFrom, type EditableVariantRow, type VariantEdits } from "../../../../shared/product-edit.ts";
import {
  MAX_OPTIONS,
  MAX_OPTION_VALUES,
  MAX_VARIANTS,
  combinationCount,
  generateVariants,
  serializeVariants,
  variantSetProblem,
  type ProductVariant,
  type VariantOption,
} from "../../../../shared/product-variants.ts";

// ─── Limits (src/lib/schemas/index.ts, StoreProductCreateSchema) ──────────────

export const LIMITS = {
  longDescription: 20000,
  longText: 5000,
  specName: 100,
  specValue: 500,
  faqQuestion: 500,
  faqAnswer: 2000,
  code: 60,
  seoTitle: 70,
  seoDescription: 160,
  tag: 40,
  tags: 30,
} as const;

export const WEIGHT_UNITS = ["kg", "g", "lb", "oz"] as const;

/** The long text boxes saved in their own product columns. */
export const TEXT_COLUMNS = ["careInstructions", "shippingInfo", "returnPolicy", "warranty", "supportInfo"] as const;
export type TextColumn = (typeof TEXT_COLUMNS)[number];

// ─── Rows (specifications and questions) ──────────────────────────────────────

export interface SpecRow { key: string; name: string; value: string }
export interface FaqRow { key: string; question: string; answer: string }

let rowCount = 0;
/** A key for a new row (React needs one; it is never saved). */
export function rowKey() {
  rowCount += 1;
  return `r${rowCount}`;
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Saved specifications ([{ name, value }]) as rows; anything unreadable is skipped. */
export function readSpecs(raw: unknown): SpecRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { name, value } = entry as { name?: unknown; value?: unknown };
    return str(name).trim() ? [{ key: rowKey(), name: str(name), value: str(value) }] : [];
  });
}

/** Saved questions ([{ question, answer }]) as rows. */
export function readFaqs(raw: unknown): FaqRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { question, answer } = entry as { question?: unknown; answer?: unknown };
    return str(question).trim() ? [{ key: rowKey(), question: str(question), answer: str(answer) }] : [];
  });
}

/** Rows as the API takes them; null with the row number (from 1) when one has only one half filled in. */
export function cleanSpecs(rows: SpecRow[]): { ok: true; list: Array<{ name: string; value: string }> } | { ok: false; row: number } {
  const list: Array<{ name: string; value: string }> = [];
  for (const [index, row] of rows.entries()) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name && !value) continue;
    if (!name || !value || name.length > LIMITS.specName || value.length > LIMITS.specValue) return { ok: false, row: index + 1 };
    list.push({ name, value });
  }
  return { ok: true, list };
}

export function cleanFaqs(rows: FaqRow[]): { ok: true; list: Array<{ question: string; answer: string }> } | { ok: false; row: number } {
  const list: Array<{ question: string; answer: string }> = [];
  for (const [index, row] of rows.entries()) {
    const question = row.question.trim();
    const answer = row.answer.trim();
    if (!question && !answer) continue;
    if (!question || !answer || question.length > LIMITS.faqQuestion || answer.length > LIMITS.faqAnswer) return { ok: false, row: index + 1 };
    list.push({ question, answer });
  }
  return { ok: true, list };
}

/** Moves a row up (-1) or down (+1). */
export function moveRow<R>(rows: R[], index: number, step: -1 | 1): R[] {
  const to = index + step;
  if (index < 0 || to < 0 || index >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// ─── Tags and video ───────────────────────────────────────────────────────────

/** "leather, bags, Leather" → ["leather", "bags"]: trimmed, each once (ignoring case). */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const tag = part.trim().replace(/^#/, "").slice(0, LIMITS.tag).trim();
    if (tag && !out.some((existing) => existing.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out.slice(0, LIMITS.tags);
}

/** A video link as saved: "youtube.com/watch?v=1" gets https://; "" stays empty; null when it isn't a link. */
export function cleanVideoUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return /^https?:\/\/[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(withScheme) ? withScheme : null;
}

// ─── The form ─────────────────────────────────────────────────────────────────

/** What the phone's GET /api/app/store-products/[id] returns for these (older servers leave most of them out). */
export interface MoreSource {
  longDescription?: string | null;
  specifications?: unknown;
  faqs?: unknown;
  careInstructions?: string | null;
  shippingInfo?: string | null;
  returnPolicy?: string | null;
  warranty?: string | null;
  supportInfo?: string | null;
  sku?: string | null;
  barcode?: string | null;
  videoUrl?: string | null;
  tags?: string[] | null;
  costPrice?: number | null;
  weight?: number | null;
  weightUnit?: string | null;
  featured?: boolean | null;
  trackStock?: boolean | null;
  continueSellingWhenOut?: boolean | null;
  reservedStock?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface MoreForm {
  longDescription: string;
  careInstructions: string;
  shippingInfo: string;
  returnPolicy: string;
  warranty: string;
  supportInfo: string;
  sku: string;
  barcode: string;
  videoUrl: string;
  tags: string;
  costPrice: string;
  weight: string;
  weightUnit: string;
  featured: boolean;
  trackStock: boolean;
  continueSelling: boolean;
  reservedStock: string;
  seoTitle: string;
  seoDescription: string;
  specs: SpecRow[];
  faqs: FaqRow[];
}

export type MoreProblem =
  | "longDescription"
  | "longText"
  | "spec"
  | "faq"
  | "sku"
  | "barcode"
  | "video"
  | "costPrice"
  | "weight"
  | "reserved"
  | "seoTitle"
  | "seoDescription";

export function moreFormFrom(source: MoreSource): MoreForm {
  return {
    longDescription: source.longDescription ?? "",
    careInstructions: source.careInstructions ?? "",
    shippingInfo: source.shippingInfo ?? "",
    returnPolicy: source.returnPolicy ?? "",
    warranty: source.warranty ?? "",
    supportInfo: source.supportInfo ?? "",
    sku: source.sku ?? "",
    barcode: source.barcode ?? "",
    videoUrl: source.videoUrl ?? "",
    tags: (source.tags ?? []).join(", "),
    costPrice: amountText(source.costPrice),
    weight: amountText(source.weight),
    weightUnit: source.weightUnit && (WEIGHT_UNITS as readonly string[]).includes(source.weightUnit) ? source.weightUnit : "kg",
    featured: Boolean(source.featured),
    trackStock: Boolean(source.trackStock),
    continueSelling: Boolean(source.continueSellingWhenOut),
    reservedStock: String(source.reservedStock ?? 0),
    seoTitle: source.seoTitle ?? "",
    seoDescription: source.seoDescription ?? "",
    specs: readSpecs(source.specifications),
    faqs: readFaqs(source.faqs),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The PATCH fields that changed, or the first thing to fix. `tracksStock`: the product counts the seller's own stock
 * (the stock switch, "set aside" and "keep selling" only apply then). Cost and weight can be changed but not
 * emptied (the API takes only numbers above 0 there, like the web form).
 */
export function morePatch(source: MoreSource, form: MoreForm, options: { tracksStock: boolean }): { ok: true; patch: Record<string, unknown> } | { ok: false; problem: MoreProblem; row?: number } {
  const patch: Record<string, unknown> = {};
  const text = (key: keyof MoreSource & keyof MoreForm, max: number, problem: MoreProblem) => {
    const value = String(form[key]).trim();
    if (value.length > max) return problem;
    if (value !== String(source[key] ?? "").trim()) patch[key] = value;
    return null;
  };

  const long = text("longDescription", LIMITS.longDescription, "longDescription");
  if (long) return { ok: false, problem: long };

  const specs = cleanSpecs(form.specs);
  if (!specs.ok) return { ok: false, problem: "spec", row: specs.row };
  const storedSpecs = cleanSpecs(readSpecs(source.specifications));
  if (!same(specs.list, storedSpecs.ok ? storedSpecs.list : [])) patch.specifications = specs.list;

  const faqs = cleanFaqs(form.faqs);
  if (!faqs.ok) return { ok: false, problem: "faq", row: faqs.row };
  const storedFaqs = cleanFaqs(readFaqs(source.faqs));
  if (!same(faqs.list, storedFaqs.ok ? storedFaqs.list : [])) patch.faqs = faqs.list;

  for (const column of TEXT_COLUMNS) {
    const problem = text(column, LIMITS.longText, "longText");
    if (problem) return { ok: false, problem };
  }

  const sku = text("sku", LIMITS.code, "sku");
  if (sku) return { ok: false, problem: sku };
  const barcode = text("barcode", LIMITS.code, "barcode");
  if (barcode) return { ok: false, problem: barcode };

  const video = cleanVideoUrl(form.videoUrl);
  if (video === null) return { ok: false, problem: "video" };
  if (video !== (source.videoUrl ?? "").trim()) patch.videoUrl = video;

  const tags = parseTags(form.tags);
  if (!same(tags, source.tags ?? [])) patch.tags = tags;

  const costText = form.costPrice.trim();
  if (costText || source.costPrice != null) {
    const cost = parseNaira(costText);
    if (cost === null) return { ok: false, problem: "costPrice" };
    if (cost !== source.costPrice) patch.costPrice = cost;
  }

  const weightText = form.weight.trim();
  if (weightText || source.weight != null) {
    const weight = parseNaira(weightText);
    if (weight === null) return { ok: false, problem: "weight" };
    if (weight !== source.weight) patch.weight = weight;
  }
  if (form.weightUnit !== (source.weightUnit ?? "kg") && (WEIGHT_UNITS as readonly string[]).includes(form.weightUnit)) patch.weightUnit = form.weightUnit;

  if (source.featured != null && form.featured !== Boolean(source.featured)) patch.featured = form.featured;

  // Stock settings: only for the seller's own stock, and only when the server sent them.
  if (options.tracksStock && source.trackStock != null) {
    if (form.trackStock !== Boolean(source.trackStock)) patch.trackStock = form.trackStock;
    const keepSelling = form.trackStock && form.continueSelling;
    if (keepSelling !== Boolean(source.continueSellingWhenOut)) patch.continueSellingWhenOut = keepSelling;
    if (form.trackStock) {
      const reserved = parseWholeNumber(form.reservedStock.trim() || "0");
      if (reserved === null) return { ok: false, problem: "reserved" };
      if (reserved !== (source.reservedStock ?? 0)) patch.reservedStock = reserved;
    }
  }

  const seoTitle = text("seoTitle", LIMITS.seoTitle, "seoTitle");
  if (seoTitle) return { ok: false, problem: seoTitle };
  const seoDescription = text("seoDescription", LIMITS.seoDescription, "seoDescription");
  if (seoDescription) return { ok: false, problem: seoDescription };

  return { ok: true, patch };
}

/** Margin on the selling price, in whole percent; null when either amount is missing. */
export function marginPercent(price: number | null, cost: number | null): number | null {
  if (!price || !cost || price <= 0) return null;
  return Math.round((1 - cost / price) * 100);
}

// ─── Sizes, colours and other options ─────────────────────────────────────────

export interface VersionState {
  options: VariantOption[];
  rows: ProductVariant[];
}

export type OptionProblem = "optionName" | "optionTwice" | "maxOptions" | "maxValues" | "tooMany";

export type OptionResult = { ok: true; state: VersionState } | { ok: false; problem: OptionProblem; count?: number };

/** New rows follow the product's own price (empty price box) unless they extend a row with its own price. */
function rebuild(options: VariantOption[], rows: ProductVariant[]): OptionResult {
  const next = generateVariants(options, rows, null);
  if (!next) return { ok: false, problem: "tooMany", count: combinationCount(options) };
  return { ok: true, state: { options, rows: next } };
}

/** A new option (Size, Colour…), with its first choices ("S, M, L"). */
export function addOption(state: VersionState, name: string, valuesText: string): OptionResult {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, problem: "optionName" };
  if (state.options.length >= MAX_OPTIONS) return { ok: false, problem: "maxOptions" };
  if (state.options.some((option) => option.name.toLowerCase() === clean.toLowerCase())) return { ok: false, problem: "optionTwice" };
  const values = splitValues(valuesText, []);
  if (values.length > MAX_OPTION_VALUES) return { ok: false, problem: "maxValues" };
  return rebuild([...state.options, { name: clean, values }], state.rows);
}

function splitValues(text: string, existing: string[]) {
  const merged = [...existing];
  for (const part of text.split(/[,\n]/)) {
    const value = part.trim().slice(0, 60);
    if (value && !merged.some((entry) => entry.toLowerCase() === value.toLowerCase())) merged.push(value);
  }
  return merged;
}

/** More choices for one option ("XL, XXL"); ones it already has are skipped. */
export function addOptionValues(state: VersionState, index: number, text: string): OptionResult {
  const option = state.options[index];
  if (!option) return { ok: true, state };
  const values = splitValues(text, option.values);
  if (values.length > MAX_OPTION_VALUES) return { ok: false, problem: "maxValues" };
  return rebuild(state.options.map((entry, i) => (i === index ? { ...entry, values } : entry)), state.rows);
}

export function removeOptionValue(state: VersionState, index: number, value: string): OptionResult {
  return rebuild(state.options.map((entry, i) => (i === index ? { ...entry, values: entry.values.filter((v) => v !== value) } : entry)), state.rows);
}

export function removeOption(state: VersionState, index: number): OptionResult {
  return rebuild(state.options.filter((_, i) => i !== index), state.rows);
}

/** Whether options or the list of versions changed (then every row is saved, as the web form does). */
export function versionShapeChanged(before: VersionState, after: VersionState) {
  return !same(before.options, after.options) || !same(before.rows.map((row) => row.id), after.rows.map((row) => row.id));
}

/** Price / stock boxes for rows that have none yet (new versions start empty: the main price, not counted). */
export function editsWithNew(rows: ProductVariant[], edits: VariantEdits): VariantEdits {
  const next: VariantEdits = {};
  for (const row of rows) next[row.id] = edits[row.id] ?? { price: amountText(row.price), stock: row.stock === null ? "" : String(row.stock) };
  return next;
}

export type VersionSave =
  | { ok: true; updates: Array<{ id: string; price?: number | null; stock?: number | null; enabled?: boolean }>; full: { variants: ReturnType<typeof serializeVariants>; variantOptions: VariantOption[] } | null }
  | { ok: false; problem: "variantPrice" | "variantStock"; name: string }
  | { ok: false; problem: "versions" };

/**
 * What to send for the versions. Same shape as loaded: price / stock / on-off changes by id (variantUpdates).
 * Options added or removed: every row and the options (variants + variantOptions), as the web form saves them.
 */
export function versionSave(stored: EditableVariantRow[], before: VersionState, after: VersionState, edits: VariantEdits, on: Record<string, boolean>): VersionSave {
  if (!versionShapeChanged(before, after)) {
    const versions = variantUpdatesFrom(stored, edits);
    if (!versions.ok) return versions;
    const updates = versions.updates.map((update) => ({ ...update })) as Array<{ id: string; price?: number | null; stock?: number | null; enabled?: boolean }>;
    for (const row of stored) {
      if (on[row.id] === undefined || on[row.id] === row.enabled) continue;
      const existing = updates.find((update) => update.id === row.id);
      if (existing) existing.enabled = on[row.id];
      else updates.push({ id: row.id, enabled: on[row.id] });
    }
    return { ok: true, updates, full: null };
  }
  const rows: ProductVariant[] = [];
  for (const row of after.rows) {
    const edit = edits[row.id] ?? { price: amountText(row.price), stock: row.stock === null ? "" : String(row.stock) };
    const priceText = edit.price.trim();
    const price = priceText ? parseNaira(priceText) : null;
    if (priceText && price === null) return { ok: false, problem: "variantPrice", name: row.name };
    const stockText = edit.stock.trim();
    const stock = stockText ? parseWholeNumber(stockText) : null;
    if (stockText && stock === null) return { ok: false, problem: "variantStock", name: row.name };
    rows.push({ ...row, price, stock, enabled: on[row.id] ?? row.enabled });
  }
  const options = after.options.filter((option) => option.name.trim() && option.values.length);
  if (rows.length > MAX_VARIANTS || variantSetProblem(options, rows)) return { ok: false, problem: "versions" };
  return { ok: true, updates: [], full: { variants: serializeVariants(rows, options), variantOptions: options } };
}
