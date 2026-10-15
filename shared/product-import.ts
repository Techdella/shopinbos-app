// Turns one row of a seller's product spreadsheet into StoreProduct fields. Pure (no imports) so the route,
// scripts and tests share it. Headers are matched loosely ("Retail Price", "retail_price", "Price" all work),
// so a file exported from another shop or a supplier list imports without renaming columns first.

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_IMAGES_PER_PRODUCT = 10;
export const IMPORT_MAX_IMAGE_FILES = 200;

type Field =
  | "name" | "description" | "retailPrice" | "costPrice" | "compareAtPrice" | "currency" | "stock" | "sku"
  | "barcode" | "status" | "availability" | "category" | "brand" | "tags" | "weight" | "images";

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

/** Which recognised field each header feeds (null = kept as a product detail). */
export function importColumns(headers: string[]) {
  return headers.map((header) => {
    const key = importHeaderKey(header);
    return { header: header.trim(), key, field: IGNORED.has(key) ? ("ignored" as const) : fieldOf(key) };
  });
}

/** True when the headers have a name column and a price column. */
export function importHeadersProblem(headers: string[]): string | null {
  const fields = new Set(importColumns(headers).map((column) => column.field));
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
  sku: string | null;
  barcode: string | null;
  weight: number | null;
  status: "published" | "draft" | "archived";
  tags: string[];
  specifications: { name: string; value: string }[];
  /** Photo references in sheet order: web addresses, or names of files uploaded with the CSV. */
  imageRefs: string[];
}

/**
 * Maps one data row (keyed by the original headers). Returns an error message instead when the row can't
 * become a product. `fallbackCurrency` is used when the row has no valid 3-letter currency.
 */
export function mapImportRow(row: Record<string, string | undefined>, fallbackCurrency: string): ImportedProduct | { error: string } {
  const values: Partial<Record<Field, string>> = {};
  const images: string[] = [];
  const specifications: { name: string; value: string }[] = [];

  const rawHeaders = Object.keys(row);
  const columns = importColumns(rawHeaders);
  for (let i = 0; i < columns.length; i++) {
    const { header, field } = columns[i]!;
    const value = (row[rawHeaders[i]!] ?? "").toString().trim();
    if (!value || field === "ignored") continue;
    if (field === "images") images.push(...splitImageCell(value));
    else if (field) values[field] ??= value;
    else if (header) specifications.push({ name: label(header).slice(0, 60), value: value.slice(0, 300) });
  }

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
    sku: values.sku?.slice(0, 100) ?? null,
    barcode: values.barcode?.slice(0, 100) ?? null,
    weight: number(values.weight),
    status: statusOf(values.status ?? "", values.availability ?? ""),
    tags,
    specifications: specifications.slice(0, 30),
    imageRefs: [...new Set(images)].slice(0, IMPORT_MAX_IMAGES_PER_PRODUCT),
  };
}
