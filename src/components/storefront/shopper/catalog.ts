// Product helpers shared by the storefront themes, the product page and the shopper bottom nav.

import { isColourOption, normalizeVariants, totalVariantStock } from "../../../../shared/product-variants.ts";
import { listingSoldOut, type ShopperStock } from "../../../../shared/product-stock.ts";
import type { PreorderState } from "../../../../shared/preorder.ts";

export interface ShopperVariant {
  id?: string;
  name?: string;
  sku?: string;
  price?: number;
  color?: string;
  size?: string;
  imageUrl?: string;
  images?: string[];
  stock?: number;
  customFields?: Array<{ name?: string; value?: string }>;
}

export interface ShopperProduct {
  id: string;
  name: string;
  description?: string | null;
  images: string[];
  retailPrice: number;
  compareAtPrice?: number | null;
  currency: string;
  category?: { id: string; name: string; slug: string; imageUrl?: string | null } | null;
  avgRating?: number;
  reviewCount?: number;
  variants?: unknown;
  variantOptions?: unknown;
  /** Product type key (shared/product-types.ts) and tags, for "Customers also like" when none are picked. */
  productType?: string | null;
  tags?: string[];
  relatedProductIds?: string[];
  supplierProduct?: { stockQuantity?: number | null } | null;
  /** Tracked stock (shared/product-stock.ts forShoppers); null or absent when the seller doesn't track it. */
  stock?: ShopperStock | null;
  /** Taking preorders (shared/preorder.ts forShoppers); null when not. */
  preorder?: PreorderState | null;
}

export function readVariants(value: unknown): ShopperVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ShopperVariant => !!item && typeof item === "object")
    .filter((item) => Boolean(item.name || item.color || item.size || item.sku));
}

const NAMED_COLOURS: Record<string, string> = {
  white: "#F4F1EA", ivory: "#F6F1E4", cream: "#F2EBDD", beige: "#E5D3B3", camel: "#C19A6B", tan: "#D2B48C", sand: "#E3CFA8",
  black: "#151515", charcoal: "#36454F", grey: "#8E8E8E", gray: "#8E8E8E", silver: "#C0C0C0",
  navy: "#1F2A44", blue: "#2F6FD6", "sky blue": "#87CEEB", teal: "#1F8A8A", turquoise: "#1FC6D6", aqua: "#5FD3D9",
  green: "#2E8B57", olive: "#6B6B3A", sage: "#9CAF88", emerald: "#1E7F5C", khaki: "#BDB76B",
  red: "#C8312F", maroon: "#6B1E2A", burgundy: "#7A1F35", wine: "#722F37", pink: "#E8A0B4", rose: "#E3A1A8", coral: "#E86A4F",
  orange: "#E87A2F", mustard: "#D4A52A", yellow: "#EBC944", gold: "#C9A24B",
  purple: "#6B4F8A", lilac: "#C8A2C8", lavender: "#B8A6D9", brown: "#6F4E37", chocolate: "#4E342E", nude: "#E3BC9A",
};

/** A swatch colour for a variant colour name, or null when we can't tell (then show the name only). */
export function colourHex(name: string | undefined | null) {
  if (!name) return null;
  const value = name.trim().toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) return value;
  return NAMED_COLOURS[value] ?? NAMED_COLOURS[value.split(/\s+/).pop() ?? ""] ?? null;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export interface VariantGroups {
  colours: string[];
  sizes: string[];
  /** Variants that have neither colour nor size are chosen by name. */
  names: string[];
}

export function variantGroups(variants: ShopperVariant[]): VariantGroups {
  const colours = unique(variants.map((variant) => variant.color));
  const sizes = unique(variants.map((variant) => variant.size));
  const names = colours.length || sizes.length ? [] : unique(variants.map((variant) => variant.name || variant.sku));
  return { colours, sizes, names };
}

export function matchVariant(variants: ShopperVariant[], choice: { colour?: string; size?: string; name?: string }) {
  return (
    variants.find(
      (variant) =>
        (!choice.colour || variant.color?.trim() === choice.colour) &&
        (!choice.size || variant.size?.trim() === choice.size) &&
        (!choice.name || (variant.name || variant.sku)?.trim() === choice.name),
    ) ?? null
  );
}

export function variantLabel(variant: ShopperVariant) {
  return [variant.color, variant.size].filter(Boolean).join(" / ") || variant.name || variant.sku || "Option";
}

/**
 * Units left when stock is tracked: the product's tracked stock, else its versions' own counts, else the supplier's
 * stock for dropship; null otherwise (and for tracked products that keep selling at 0).
 */
export function unitsLeft(product: Pick<ShopperProduct, "variants" | "supplierProduct" | "stock">) {
  if (product.stock) return product.stock.continueSelling ? null : product.stock.left;
  const tracked = totalVariantStock(normalizeVariants(product.variants));
  if (tracked !== null) return Math.max(0, tracked);
  const supplier = product.supplierProduct?.stockQuantity;
  return typeof supplier === "number" ? supplier : null;
}

/** "Only 3 left" only when stock is tracked and genuinely low (the seller's low-stock level, else 5). */
export function lowStockLabel(product: Pick<ShopperProduct, "variants" | "supplierProduct" | "stock" | "preorder">) {
  // Taking preorders: the card says so instead of a stock line.
  if (product.preorder?.on) return product.preorder.open ? "Preorder" : null;
  const left = unitsLeft(product);
  const lowAt = product.stock?.lowAt ?? 5;
  return left !== null && left > 0 && left <= lowAt ? `Only ${left} left` : null;
}

/** A card's "Sold out" badge: tracked stock (or the supplier's for dropship) at 0, with no backorders; full preorders. */
export function soldOutLabel(product: Pick<ShopperProduct, "supplierProduct" | "stock" | "preorder">) {
  if (!listingSoldOut(product)) return null;
  return product.preorder?.on ? "Preorders full" : "Sold out";
}

export function productColours(product: Pick<ShopperProduct, "variants">) {
  const colours = normalizeVariants(product.variants)
    .filter((variant) => variant.enabled)
    .map((variant) => Object.entries(variant.options).find(([name]) => isColourOption(name))?.[1]);
  return unique(colours)
    .map((name) => ({ name, hex: colourHex(name) }))
    .filter((entry): entry is { name: string; hex: string } => Boolean(entry.hex))
    .slice(0, 4);
}

export function searchProducts<P extends ShopperProduct>(products: P[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return products;
  return products.filter((product) => {
    const haystack = `${product.name} ${product.category?.name ?? ""} ${product.description ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Categories that actually have products, with the first product image as the tile image. */
export function productCategories(products: ShopperProduct[]) {
  const map = new Map<string, { slug: string; name: string; imageUrl: string | null; count: number }>();
  for (const product of products) {
    const category = product.category;
    if (!category?.slug) continue;
    const existing = map.get(category.slug);
    map.set(category.slug, {
      slug: category.slug,
      name: category.name,
      imageUrl: existing?.imageUrl ?? product.images[0] ?? null,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...map.values()];
}

/** Best sellers: highest rated with the most reviews first, then the newest (the API returns newest first). */
export function bestSellers<P extends ShopperProduct>(products: P[]) {
  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => (b.product.reviewCount ?? 0) - (a.product.reviewCount ?? 0) || (b.product.avgRating ?? 0) - (a.product.avgRating ?? 0) || a.index - b.index)
    .map((entry) => entry.product);
}

/** A product with more than one version to choose from: quick "Add to bag" buttons open its page instead. */
export function needsOptions(product: Pick<ShopperProduct, "variants">) {
  return normalizeVariants(product.variants).filter((variant) => variant.enabled).length > 1;
}

/**
 * "Customers also like": the products the seller picked (in their order), else the store's products of the same
 * type, category or tags (closest first), then the rest. The product itself never appears.
 */
export function relatedProducts<P extends Pick<ShopperProduct, "id" | "category" | "productType" | "tags">>(
  product: Pick<ShopperProduct, "id" | "category" | "productType" | "tags" | "relatedProductIds">,
  catalog: P[],
  limit = 8,
): P[] {
  const others = catalog.filter((entry) => entry.id !== product.id);
  const picked = (product.relatedProductIds ?? []).map((id) => others.find((entry) => entry.id === id)).filter((entry): entry is P => Boolean(entry));
  if (picked.length) return picked.slice(0, limit);
  const tags = new Set((product.tags ?? []).map((tag) => tag.toLowerCase()));
  const score = (entry: P) =>
    (product.productType && entry.productType === product.productType ? 2 : 0) +
    (product.category?.slug && entry.category?.slug === product.category.slug ? 3 : 0) +
    (entry.tags ?? []).filter((tag) => tags.has(tag.toLowerCase())).length;
  return others
    .map((entry, index) => ({ entry, index, score: score(entry) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.entry)
    .slice(0, limit);
}
