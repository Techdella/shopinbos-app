import { api } from "./api";
import { parsePricingTiers, shipsLabel, shortCategory, type FindTier } from "./find-pure";

// Find products: supplier products from the public marketplace API (/api/public/products, the same rows the
// web's /marketplace shows), plus the seller's own bits from /api/mobile/marketplace (already added, where
// wholesale ships to) and "Add to store" / "Request a quote".

interface RawProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  images: string[];
  wholesalePrice: number;
  suggestedRetailPrice: number;
  moq: number;
  stockQuantity: number;
  pricingTiers?: unknown;
  dropshipAvailable: boolean;
  bulkOrderAvailable: boolean;
  processingTime: string | null;
  trendScore: number;
  supplier: { id: string; displayName: string; slug: string; city: string; rating: number; ratingCount?: number; description?: string | null; responseTimeLabel?: string | null };
  category: { name: string } | null;
}

export interface FindProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  supplier: { id: string; name: string; city: string; rating: number | null; about: string | null; responds: string | null };
  /** What the supplier charges per unit (dropship). */
  cost: number;
  /** Suggested selling price. */
  price: number;
  ships: string;
  stock: number;
  moq: number;
  tiers: FindTier[];
  dropship: boolean;
  wholesale: boolean;
  trendScore: number;
}

function toFindProduct(row: RawProduct): FindProduct {
  const rated = row.supplier.ratingCount === undefined ? row.supplier.rating > 0 : row.supplier.ratingCount > 0;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    category: shortCategory(row.category?.name),
    images: (row.images ?? []).filter(Boolean),
    supplier: {
      id: row.supplier.id,
      name: row.supplier.displayName,
      city: row.supplier.city,
      rating: rated ? row.supplier.rating : null,
      about: row.supplier.description ?? null,
      responds: row.supplier.responseTimeLabel ?? null,
    },
    cost: Number(row.wholesalePrice) || 0,
    price: Number(row.suggestedRetailPrice) || 0,
    ships: shipsLabel(row.processingTime),
    stock: row.stockQuantity,
    moq: Math.max(1, row.moq),
    tiers: parsePricingTiers(row.pricingTiers),
    dropship: row.dropshipAvailable,
    wholesale: row.bulkOrderAvailable,
    trendScore: row.trendScore,
  };
}

/** Up to 100 products from verified suppliers in the seller's country, most trending first. */
export async function fetchFindProducts(country: string, q?: string) {
  const params = new URLSearchParams({ limit: "100", sort: "trending", country });
  if (q?.trim()) params.set("q", q.trim().slice(0, 120));
  const rows = await api<RawProduct[]>(`/api/public/products?${params.toString()}`);
  return rows.map(toFindProduct);
}

export async function fetchFindProduct(slug: string) {
  return toFindProduct(await api<RawProduct>(`/api/public/products/${encodeURIComponent(slug)}`));
}

export interface FindContext {
  country: string;
  destination: string;
  addedIds: string[];
}

export const fetchFindContext = () => api<FindContext>("/api/mobile/marketplace");

export const addToStore = (supplierProductId: string, retailPrice: number) =>
  api<{ storeProductId: string; already: boolean }>("/api/mobile/marketplace", { method: "POST", json: { supplierProductId, retailPrice } });

export const requestQuote = (input: { supplierId: string; supplierProductId: string; quantity: number; destination: string; notes?: string }) =>
  api<{ id: string }>("/api/app/supplier-quotes", { method: "POST", json: input });
