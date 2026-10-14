// Editing one product from the phone (apps/mobile/src/app/product/[id].tsx). Pure, unit-tested in
// tests/product-edit-labels.test.mjs. The phone saves with the same route and rules as the web form
// (src/app/components/ProductForm.tsx → PATCH /api/store/products/[id], StoreProductUpdateSchema): this file only
// turns what the seller typed into that request, and sends just the fields that changed.

/** Where a product comes from: the seller's own stock, a supplier (dropship), or something else (digital…). */
export type ProductKind = "own" | "dropship" | "other";

export function productKind(product: { inventoryType: string; dropship?: unknown }): ProductKind {
  if (product.dropship || product.inventoryType === "dropshipping") return "dropship";
  return product.inventoryType === "seller" ? "own" : "other";
}

/** Only the seller's own stock is counted (low-stock alerts watch inventoryType "seller", see alert-engine.ts). */
export function tracksStock(inventoryType: string) {
  return inventoryType === "seller";
}

/** Naira from what someone typed ("12,500", "₦ 2500.50"); null when it isn't a positive amount. */
export function parseNaira(text: string): number | null {
  const clean = text.replace(/[,₦\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const value = Math.round(Number(clean) * 100) / 100;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** A whole number (0 or more) from what someone typed; null when it isn't one. */
export function parseWholeNumber(text: string): number | null {
  const clean = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isSafeInteger(value) ? value : null;
}

/** The text a price box starts with: 25000 → "25000", null → "". */
export function amountText(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

export interface EditableProduct {
  name: string;
  description: string | null;
  images: string[];
  retailPrice: number;
  compareAtPrice: number | null;
  currentStock: number;
  lowStockThreshold: number;
  inventoryType: string;
}

/** What the seller typed: amounts and counts are text from the boxes. */
export interface ProductEditForm {
  name: string;
  price: string;
  compareAt: string;
  stock: string;
  lowStock: string;
  description: string;
  images: string[];
}

export type ProductEditProblem = "name" | "price" | "compareAt" | "stock" | "lowStock" | "description";

export type ProductPatchResult = { ok: true; patch: Record<string, unknown> } | { ok: false; problem: ProductEditProblem };

// The same limits as StoreProductCreateSchema (src/lib/schemas/index.ts).
const NAME_MIN = 2;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 5000;

export function formFromProduct(product: EditableProduct): ProductEditForm {
  return {
    name: product.name,
    price: amountText(product.retailPrice),
    compareAt: amountText(product.compareAtPrice),
    stock: String(product.currentStock ?? 0),
    lowStock: String(product.lowStockThreshold ?? 10),
    description: product.description ?? "",
    images: [...product.images],
  };
}

/**
 * The PATCH body for what changed, or the first box that needs fixing. Stock boxes count only for products that
 * track stock; an empty "was" price takes it off (null).
 */
export function productPatch(product: EditableProduct, form: ProductEditForm): ProductPatchResult {
  const patch: Record<string, unknown> = {};

  const name = form.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return { ok: false, problem: "name" };
  if (name !== product.name) patch.name = name;

  const price = parseNaira(form.price);
  if (price === null) return { ok: false, problem: "price" };
  if (price !== product.retailPrice) patch.retailPrice = price;

  const compareAtText = form.compareAt.trim();
  const compareAt = compareAtText ? parseNaira(compareAtText) : null;
  if (compareAtText && compareAt === null) return { ok: false, problem: "compareAt" };
  if (compareAt !== (product.compareAtPrice ?? null)) patch.compareAtPrice = compareAt;

  if (tracksStock(product.inventoryType)) {
    const stock = parseWholeNumber(form.stock);
    if (stock === null) return { ok: false, problem: "stock" };
    if (stock !== product.currentStock) patch.currentStock = stock;
    const lowStock = parseWholeNumber(form.lowStock);
    if (lowStock === null) return { ok: false, problem: "lowStock" };
    if (lowStock !== product.lowStockThreshold) patch.lowStockThreshold = lowStock;
  }

  const description = form.description.trim();
  if (description.length > DESCRIPTION_MAX) return { ok: false, problem: "description" };
  if (description !== (product.description ?? "").trim()) patch.description = description;

  if (form.images.length !== product.images.length || form.images.some((url, index) => url !== product.images[index])) {
    patch.images = [...form.images];
  }

  return { ok: true, patch };
}

/** Photos: the first one is the main photo (the shop and checkout show it). */
export function makeMainPhoto(images: string[], index: number): string[] {
  if (index <= 0 || index >= images.length) return images;
  return [images[index], ...images.slice(0, index), ...images.slice(index + 1)];
}

export function movePhoto(images: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return images;
  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function removePhoto(images: string[], index: number): string[] {
  return images.filter((_, i) => i !== index);
}

export interface VariantRow {
  name: string;
  price: number | null;
  stock: number | null;
}

/** Variants as stored on the product (JSON), shown read-only. Anything unreadable is skipped. */
export function variantRows(variants: unknown): VariantRow[] {
  if (!Array.isArray(variants)) return [];
  return variants.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const v = raw as { name?: unknown; color?: unknown; size?: unknown; price?: unknown; stock?: unknown };
    const name = [v.name, v.color, v.size].find((part) => typeof part === "string" && part.trim());
    if (typeof name !== "string") return [];
    const price = typeof v.price === "number" && Number.isFinite(v.price) ? v.price : null;
    const stock = typeof v.stock === "number" && Number.isFinite(v.stock) ? v.stock : null;
    return [{ name: name.trim(), price, stock }];
  });
}
