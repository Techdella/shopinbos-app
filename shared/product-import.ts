// Turns one row of a seller's product spreadsheet into StoreProduct fields. Pure (no imports) so the route,
// scripts and tests share it. Headers are matched loosely ("Retail Price", "retail_price", "Price" all work),
// so a file exported from another shop or a supplier list imports without renaming columns first.

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_IMAGES_PER_PRODUCT = 10;
export const IMPORT_MAX_IMAGE_FILES = 200;

export const IMPORT_FIELDS = [
  "name", "description", "retailPrice", "costPrice", "compareAtPrice", "currency", "stock", "sku",
  "barcode", "status", "availability", "category", "brand", "tags", "weight", "images",
] as const;
type Field = (typeof IMPORT_FIELDS)[number];
export type ImportField = Field;
/** What a column feeds: a product field, a product detail ("Colour: Red"), or nothing. */
export type ColumnTarget = Field | "detail" | "ignored";
/** The seller's (or Peggy's) choice per header, overriding the automatic match. */
export type ColumnMap = Record<string, ColumnTarget>;

export function isColumnTarget(value: unknown): value is ColumnTarget {
  return value === "detail" || value === "ignored" || (typeof value === "string" && (IMPORT_FIELDS as readonly string[]).includes(value));
}

const ALIASES: Record<Field, string[]> = {
  name: ["name", "title", "productname", "product", "producttitle"],
  description: ["description", "productdescription", "body", "details", "shortdescription"],
  retailPrice: ["retailprice", "price", "sellingprice", "saleprice", "unitprice", "variantprice"],
  costPrice: ["costprice", "cost", "costperitem", "buyingprice"],
  compareAtPrice: ["compareatprice", "variantcompareatprice", "oldprice", "originalprice", "listprice", "msrp"],
  currency: ["currency"],
  stock: ["stock", "quantity", "qty", "inventory", "inventoryquantity", "variantinventoryqty", "currentstock", "stockquantity"],
  sku: ["sku", "variantsku", "internalid", "itemcode", "productcode"],
  barcode: ["barcode", "variantbarcode", "ean", "upc", "gtin", "isbn"],
  status: ["status"],
  availability: ["availability", "stockstatus"],
  category: ["category", "producttype", "type", "productcategory"],
  brand: ["brand", "vendor", "manufacturer"],
  tags: ["tags"],
  weight: ["weight", "weightkg", "variantgrams"],
  images: ["images", "image", "imageurl", "imageurls", "imagesrc", "photo", "photos", "photourl", "picture", "pictures", "mainimage", "imagelink", "imagefile", "imagefiles"],
};

// Bookkeeping columns that say nothing about the product.
const IGNORED = new Set(["index", "id", "no", "rownumber", "handle", "visibility", "createdat", "updatedat"]);

/** "Retail Price" → "retailprice". */
export function importHeaderKey(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fieldOf(key: string): Field | null {
  for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
    if (aliases.includes(key)) return field;
  }
  // "Image 2", "image_url_3", "Photo1" — extra photo columns.
  if (/^(image|photo|picture)(url|src|link|file)?\d+$/.test(key)) return "images";
  return null;
}

/**
 * Which recognised field each header feeds (null = kept as a product detail). `columnMap` (by header, as written)
 * overrides the automatic match.
 */
export function importColumns(headers: string[], columnMap?: ColumnMap | null) {
  return headers.map((header) => {
    const key = importHeaderKey(header);
    const chosen = columnMap?.[header.trim()] ?? columnMap?.[header];
    if (chosen && isColumnTarget(chosen)) return { header: header.trim(), key, field: chosen === "detail" ? null : chosen };
    return { header: header.trim(), key, field: IGNORED.has(key) ? ("ignored" as const) : fieldOf(key) };
  });
}

// Loose guesses for headers no alias knows ("Selling Price (₦)", "Item Description", "Qty Available", "Pic link").
// Order matters: the more specific words first.
const GUESSES: Array<[RegExp, Field]> = [
  [/(compare|was|old|original|before|slashed|regular)\w*price|rrp|msrp/, "compareAtPrice"],
  [/cost|buying|purchase|wholesale/, "costPrice"],
  [/price|amount|naira|ngn|selling|retail|rate/, "retailPrice"],
  [/desc|about|summary|overview|details?text/, "description"],
  [/qty|quant|instock|stocklevel|available|units|onhand|inventory/, "stock"],
  [/barcode|ean|upc|gtin|isbn/, "barcode"],
  [/sku|itemcode|productcode|code$|^ref|reference|modelno|partno/, "sku"],
  [/img|image|pic|photo|thumbnail|picture/, "images"],
  [/categ|department|dept|section|collection|group/, "category"],
  [/brand|make$|maker|vendor|manufactur/, "brand"],
  [/tag|keyword|label/, "tags"],
  [/weight|kg$|grams?$|mass/, "weight"],
  [/currency|curr$/, "currency"],
  [/status|published|active|visible/, "status"],
  [/name|title|item|product/, "name"],
];

const SINGLE: ReadonlySet<Field> = new Set(IMPORT_FIELDS.filter((field) => field !== "images"));

export interface ColumnSuggestion {
  header: string;
  target: ColumnTarget;
  /** known: an alias matched; guessed: a loose match on the words; detail: becomes a product detail; ignored. */
  how: "known" | "guessed" | "detail" | "ignored";
}

/**
 * Every header's suggested target. Known aliases win; other headers are guessed from their words when that field
 * isn't taken yet (only photos can come from several columns); the rest become product details.
 */
export function suggestColumnMapping(headers: string[]): ColumnSuggestion[] {
  const known = importColumns(headers);
  const taken = new Set<Field>(known.flatMap((column) => (column.field && column.field !== "ignored" ? [column.field] : [])));
  return known.map((column) => {
    if (column.field === "ignored") return { header: column.header, target: "ignored", how: "ignored" };
    if (column.field) return { header: column.header, target: column.field, how: "known" };
    const guess = GUESSES.find(([pattern]) => pattern.test(column.key))?.[1];
    if (guess && (!SINGLE.has(guess) || !taken.has(guess))) {
      taken.add(guess);
      return { header: column.header, target: guess, how: "guessed" };
    }
    return { header: column.header, target: "detail", how: "detail" };
  });
}

/** The suggestions as a column map for importColumns / mapImportRow. */
export function columnMapFrom(suggestions: Array<{ header: string; target: ColumnTarget }>): ColumnMap {
  return Object.fromEntries(suggestions.map((s) => [s.header, s.target]));
}

/** True when the headers have a name column and a price column. */
export function importHeadersProblem(headers: string[], columnMap?: ColumnMap | null): string | null {
  const fields = new Set(importColumns(headers, columnMap).map((column) => column.field));
  if (!fields.has("name") || !fields.has("retailPrice")) return "CSV must have at least a 'name' and a 'price' (or 'retailPrice') column";
  return null;
}

function number(value: string | undefined): number | null {
  if (!value) return null;
  // "₦12,500.00", "$265", "1 200" → 12500, 265, 1200.
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Splits a cell holding one or more photos: "a.jpg | b.jpg", "url1;url2", "url1, url2" or one per line. */
export function splitImageCell(value: string) {
  return value
    .split(/[|;\n\r]+|,(?=\s*(?:https?:\/\/|[^,/\\]+\.(?:jpe?g|png|webp|gif)\b))/i)
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** True when the cell looks like a web address rather than the name of an uploaded file. */
export function isImageUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

/** File name without folders, lower-cased, for matching a CSV cell to an uploaded photo. */
export function imageFileKey(value: string) {
  return (value.split(/[\\/]/).pop() ?? value).trim().toLowerCase();
}

const LIVE = new Set(["published", "active", "live", "visible", "enabled", "online", "true", "yes"]);
const ARCHIVED = new Set(["archived", "deleted", "removed"]);
const UNAVAILABLE = new Set(["discontinued", "inactive", "disabled", "hidden"]);

function statusOf(status: string, availability: string) {
  const s = status.toLowerCase().trim();
  if (s) return LIVE.has(s) ? "published" : ARCHIVED.has(s) ? "archived" : "draft";
  const a = availability.toLowerCase().replace(/[\s-]+/g, "_").trim();
  // Spreadsheets with only an availability column describe products already on sale.
  if (a) return UNAVAILABLE.has(a) ? "draft" : "published";
  return "draft";
}

function label(header: string) {
  const spaced = header.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface ImportedProduct {
  name: string;
  description: string | null;
  retailPrice: number;
  costPrice: number | null;
  compareAtPrice: number | null;
  currency: string;
  currentStock: number;
  /** A stock column with a number in it: the count is tracked ("Track stock" on). */
  trackStock: boolean;
  sku: string | null;
  barcode: string | null;
  weight: number | null;
  status: "published" | "draft" | "archived";
  tags: string[];
  /** The category column as written (also kept as a tag). */
  category: string | null;
  specifications: { name: string; value: string }[];
  /** Photo references in sheet order: web addresses, or names of files uploaded with the CSV. */
  imageRefs: string[];
}

/**
 * Maps one data row (keyed by the original headers). Returns an error message instead when the row can't
 * become a product. `fallbackCurrency` is used when the row has no valid 3-letter currency.
 */
/** One row's cells by field (first non-empty cell wins), its photo references and its other columns as details. */
function readRow(row: Record<string, string | undefined>, columnMap?: ColumnMap | null) {
  const values: Partial<Record<Field, string>> = {};
  const images: string[] = [];
  const specifications: { name: string; value: string }[] = [];
  const rawHeaders = Object.keys(row);
  const columns = importColumns(rawHeaders, columnMap);
  for (let i = 0; i < columns.length; i++) {
    const { header, field } = columns[i]!;
    const value = (row[rawHeaders[i]!] ?? "").toString().trim();
    if (!value || field === "ignored") continue;
    if (field === "images") images.push(...splitImageCell(value));
    else if (field) values[field] ??= value;
    else if (header) specifications.push({ name: label(header).slice(0, 60), value: value.slice(0, 300) });
  }
  return { values, images, specifications };
}

export function mapImportRow(row: Record<string, string | undefined>, fallbackCurrency: string, columnMap?: ColumnMap | null): ImportedProduct | { error: string } {
  const { values, images, specifications } = readRow(row, columnMap);

  const name = values.name?.slice(0, 200);
  const retailPrice = number(values.retailPrice);
  if (!name) return { error: "missing name" };
  if (retailPrice === null || retailPrice < 0) return { error: "missing or invalid price" };

  if (values.brand) specifications.unshift({ name: "Brand", value: values.brand.slice(0, 300) });
  const tags = [values.category, values.brand, ...(values.tags ?? "").split(/[,|;]/)]
    .map((tag) => tag?.trim())
    .filter((tag): tag is string => Boolean(tag))
    .filter((tag, i, all) => all.findIndex((other) => other.toLowerCase() === tag.toLowerCase()) === i)
    .slice(0, 20);

  const currency = /^[A-Za-z]{3}$/.test(values.currency ?? "") ? values.currency!.toUpperCase() : fallbackCurrency;
  const stock = number(values.stock);

  return {
    name,
    description: values.description ?? null,
    retailPrice,
    costPrice: number(values.costPrice),
    compareAtPrice: number(values.compareAtPrice),
    currency,
    currentStock: stock === null ? 0 : Math.max(0, Math.round(stock)),
    trackStock: stock !== null,
    sku: values.sku?.slice(0, 100) ?? null,
    barcode: values.barcode?.slice(0, 100) ?? null,
    weight: number(values.weight),
    status: statusOf(values.status ?? "", values.availability ?? ""),
    tags,
    category: values.category?.slice(0, 60) ?? null,
    specifications: specifications.slice(0, 30),
    imageRefs: [...new Set(images)].slice(0, IMPORT_MAX_IMAGES_PER_PRODUCT),
  };
}

// ─── Photos ──────────────────────────────────────────────────────────────────

/** "Ankara Tote Bag" → "ankara-tote-bag", to match a photo named after the product. */
export function importSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * A row's photos: web addresses as they are (`linkProblem` says when one can't be used), file names matched to the
 * photos uploaded with the sheet (`uploaded`: file key → url). A row naming no photos gets an uploaded photo named
 * after its SKU or product name.
 */
export function resolveImportImages(
  product: Pick<ImportedProduct, "imageRefs" | "sku" | "name">,
  uploaded: Map<string, string>,
  linkProblem: (url: string) => string | null,
) {
  const images: string[] = [];
  const badLinks: string[] = [];
  const missingFiles: string[] = [];
  for (const ref of product.imageRefs) {
    if (isImageUrl(ref)) {
      if (linkProblem(ref)) badLinks.push(ref);
      else images.push(ref);
      continue;
    }
    const url = uploaded.get(imageFileKey(ref));
    if (url) images.push(url);
    else missingFiles.push(ref);
  }
  if (!product.imageRefs.length && uploaded.size) {
    const byStem = new Map<string, string>();
    for (const [name, url] of uploaded) byStem.set(importSlug(name.replace(/\.[a-z0-9]+$/, "")), url);
    const match = (product.sku && byStem.get(importSlug(product.sku))) || byStem.get(importSlug(product.name));
    if (match) images.push(match);
  }
  return { images, badLinks, missingFiles };
}

/** A web address a browser could load: http(s) with a host that has a dot. */
export function basicLinkProblem(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "not a web link";
    if (!parsed.hostname.includes(".")) return "not a web link";
    return null;
  } catch {
    return "not a web link";
  }
}

// ─── Checking a file before it is imported ───────────────────────────────────

export type ImportIssueKind =
  | "no_name"
  | "no_price"
  | "bad_price"
  | "duplicate_sku"
  | "sku_exists"
  | "bad_image_link"
  | "broken_image_link"
  | "photo_missing"
  | "cost_above_price"
  | "was_price_low";

export interface ImportIssue {
  /** The row number as the seller sees it in the sheet (header = row 1). */
  row: number;
  kind: ImportIssueKind;
  value?: string;
}

/** Problems that stop a row from being imported; the others are warnings. */
export const BLOCKING_ISSUES: ReadonlySet<ImportIssueKind> = new Set(["no_name", "no_price", "bad_price"]);

export interface AnalysedRow {
  /** Position among the data rows (0-based), the key for Peggy's suggestions. */
  index: number;
  row: number;
  ok: boolean;
  name: string;
  price: number | null;
  sku: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  specifications: { name: string; value: string }[];
  images: string[];
}

export interface ImportAnalysis {
  rows: AnalysedRow[];
  issues: ImportIssue[];
  counts: { rows: number; ready: number; blocked: number; noPhoto: number; noDescription: number };
}

/**
 * Checks every row as the import would read it (with the chosen columns): missing names or prices, prices that
 * aren't numbers, SKUs used twice in the file or already in the shop (`existingSkus`, lower-case), photo links that
 * can't work and photo files that weren't uploaded, cost above price and a was-price below the price.
 */
export function analyseImport(
  rows: Array<Record<string, string | undefined>>,
  opts: { currency: string; columnMap?: ColumnMap | null; uploaded?: Map<string, string>; existingSkus?: Set<string>; linkProblem?: (url: string) => string | null },
): ImportAnalysis {
  const uploaded = opts.uploaded ?? new Map<string, string>();
  const linkProblem = opts.linkProblem ?? basicLinkProblem;
  const issues: ImportIssue[] = [];
  const out: AnalysedRow[] = [];
  const skuRows = new Map<string, number>();
  let noPhoto = 0;
  let noDescription = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const { values } = readRow(row, opts.columnMap);
    const product = mapImportRow(row, opts.currency, opts.columnMap);
    if ("error" in product) {
      const kind: ImportIssueKind = !values.name ? "no_name" : values.retailPrice ? "bad_price" : "no_price";
      issues.push({ row: rowNumber, kind, ...(kind === "bad_price" ? { value: values.retailPrice!.slice(0, 40) } : {}) });
      out.push({ index, row: rowNumber, ok: false, name: values.name?.slice(0, 200) ?? "", price: null, sku: values.sku ?? null, description: values.description ?? null, category: values.category ?? null, tags: [], specifications: [], images: [] });
      return;
    }
    if (product.sku) {
      const key = product.sku.trim().toLowerCase();
      const first = skuRows.get(key);
      if (first !== undefined) issues.push({ row: rowNumber, kind: "duplicate_sku", value: `${product.sku} (row ${first})` });
      else skuRows.set(key, rowNumber);
      if (opts.existingSkus?.has(key)) issues.push({ row: rowNumber, kind: "sku_exists", value: product.sku });
    }
    if (product.costPrice !== null && product.costPrice > product.retailPrice) issues.push({ row: rowNumber, kind: "cost_above_price", value: `${product.costPrice} > ${product.retailPrice}` });
    if (product.compareAtPrice !== null && product.compareAtPrice > 0 && product.compareAtPrice <= product.retailPrice) {
      issues.push({ row: rowNumber, kind: "was_price_low", value: `${product.compareAtPrice} ≤ ${product.retailPrice}` });
    }
    const photos = resolveImportImages(product, uploaded, linkProblem);
    for (const link of photos.badLinks) issues.push({ row: rowNumber, kind: "bad_image_link", value: link.slice(0, 120) });
    for (const file of photos.missingFiles) issues.push({ row: rowNumber, kind: "photo_missing", value: file.slice(0, 120) });
    if (!photos.images.length) noPhoto++;
    if (!product.description) noDescription++;
    out.push({
      index,
      row: rowNumber,
      ok: true,
      name: product.name,
      price: product.retailPrice,
      sku: product.sku,
      description: product.description,
      category: product.category,
      tags: product.tags,
      specifications: product.specifications,
      images: photos.images,
    });
  });

  const ready = out.filter((row) => row.ok).length;
  return { rows: out, issues, counts: { rows: rows.length, ready, blocked: rows.length - ready, noPhoto, noDescription } };
}
