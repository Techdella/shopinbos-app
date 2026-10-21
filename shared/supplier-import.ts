// Supplier CSV bulk upload (Supplier Plus and up): one product per row, every row checked on its own so good rows
// still go in. Products come in as drafts for the supplier to review and submit (src/app/actions/supplier.ts).

export const SUPPLIER_IMPORT_MAX_ROWS = 500;

export const SUPPLIER_IMPORT_COLUMNS = [
  "name",
  "description",
  "category",
  "image_urls",
  "wholesale_price",
  "wholesale_price_to",
  "retail_price",
  "moq",
  "stock",
  "dropship",
  "samples",
  "delivery_regions",
  "processing_time",
] as const;

export interface SupplierImportCategory {
  id: string;
  name: string;
  slug: string;
}

export interface SupplierImportProduct {
  name: string;
  description: string;
  categoryId: string;
  images: string[];
  wholesalePrice: number;
  wholesalePriceTo?: number;
  suggestedRetailPrice: number;
  moq: number;
  stockQuantity: number;
  dropshipAvailable: boolean;
  sampleAvailable: boolean;
  deliveryRegions: string[];
  processingTime?: string;
}

const key = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
const yes = (value: string | undefined) => /^(y|yes|true|1)$/i.test((value ?? "").trim());
const list = (value: string | undefined) => (value ?? "").split(/[|;\n]/).map((item) => item.trim()).filter(Boolean);
const amount = (value: string | undefined) => {
  const n = Number(String(value ?? "").replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const whole = (value: string | undefined, fallback: number) => {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/** Rows keyed by header (any case, spaces or dashes) → products and the problems by row number (1 = first data row). */
export function parseSupplierImport(rows: ReadonlyArray<Record<string, string>>, categories: readonly SupplierImportCategory[]) {
  const products: Array<{ row: number; product: SupplierImportProduct }> = [];
  const errors: Array<{ row: number; message: string }> = [];
  const byName = new Map(categories.flatMap((category) => [[category.name.toLowerCase(), category.id], [category.slug.toLowerCase(), category.id]] as const));
  rows.slice(0, SUPPLIER_IMPORT_MAX_ROWS).forEach((raw, index) => {
    const row = index + 1;
    const cell = Object.fromEntries(Object.entries(raw).map(([name, value]) => [key(name), String(value ?? "").trim()])) as Record<string, string>;
    if (Object.values(cell).every((value) => !value)) return;
    const fail = (message: string) => errors.push({ row, message });
    const name = cell.name ?? "";
    if (name.length < 2 || name.length > 200) return fail("Add a product name (2 to 200 characters).");
    const description = cell.description ?? "";
    if (description.length < 10) return fail("Add a description of at least 10 characters.");
    const categoryId = byName.get((cell.category ?? "").toLowerCase());
    if (!categoryId) return fail(`Unknown category "${cell.category ?? ""}". Use one of the category names listed on this page.`);
    const images = list(cell.image_urls).filter((url) => /^https:\/\/\S+$/i.test(url)).slice(0, 10);
    if (!images.length) return fail("Add at least one image link starting with https://.");
    const wholesalePrice = amount(cell.wholesale_price);
    if (!wholesalePrice) return fail("Add a wholesale price above 0.");
    const wholesalePriceTo = cell.wholesale_price_to ? amount(cell.wholesale_price_to) : null;
    if (cell.wholesale_price_to && (!wholesalePriceTo || wholesalePriceTo < wholesalePrice)) return fail("The top of the wholesale price range must be above the wholesale price.");
    const retail = amount(cell.retail_price) ?? Math.round(wholesalePrice * 1.5);
    const moq = whole(cell.moq, 1);
    const stock = whole(cell.stock, 0);
    if (!moq || moq < 1) return fail("Minimum order must be a whole number of 1 or more.");
    if (stock === null) return fail("Stock must be a whole number.");
    products.push({
      row,
      product: {
        name,
        description: description.slice(0, 5000),
        categoryId,
        images,
        wholesalePrice,
        ...(wholesalePriceTo ? { wholesalePriceTo } : {}),
        suggestedRetailPrice: retail,
        moq,
        stockQuantity: stock,
        dropshipAvailable: yes(cell.dropship),
        sampleAvailable: yes(cell.samples),
        deliveryRegions: list(cell.delivery_regions).slice(0, 40),
        ...(cell.processing_time ? { processingTime: cell.processing_time.slice(0, 80) } : {}),
      },
    });
  });
  if (rows.length > SUPPLIER_IMPORT_MAX_ROWS) errors.push({ row: SUPPLIER_IMPORT_MAX_ROWS + 1, message: `Only the first ${SUPPLIER_IMPORT_MAX_ROWS} rows are read. Upload the rest in another file.` });
  return { products, errors };
}
