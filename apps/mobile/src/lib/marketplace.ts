import { api } from "./api";
import { parsePricingTiers, shipsLabel, shortCategory, type FindTier } from "./find-pure";

// Find products: supplier products from /api/mobile/marketplace/products (the same rows the web's /marketplace
// shows: suppliers near the seller, verified or not, with their risk score), plus the seller's own bits from
// /api/mobile/marketplace (already added, where wholesale ships to), the Dropship agreement before listing
// (call the supplier, check the stock, agree), and "Add to store" / "Request a quote".

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
  supplier: {
    id: string;
    displayName: string;
    slug: string;
    city: string;
    rating: number;
    ratingCount?: number;
    description?: string | null;
    responseTimeLabel?: string | null;
    verificationStatus?: string;
    returnPolicy?: string | null;
    risk?: SupplierRisk | null;
    km?: number | null;
    agreed?: boolean;
  };
  category: { name: string } | null;
}

export interface SupplierRisk {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
}

export interface FindProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  supplier: {
    id: string;
    name: string;
    city: string;
    rating: number | null;
    about: string | null;
    responds: string | null;
    /** verified | pending | unverified */
    verificationStatus: string;
    returnPolicy: string | null;
    risk: SupplierRisk | null;
    km: number | null;
    /** The seller and the supplier both accepted the Dropship agreement. */
    agreed: boolean;
  };
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
      verificationStatus: row.supplier.verificationStatus ?? "verified",
      returnPolicy: row.supplier.returnPolicy?.trim() || null,
      risk: row.supplier.risk ?? null,
      km: typeof row.supplier.km === "number" ? row.supplier.km : null,
      agreed: row.supplier.agreed === true,
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

/**
 * Up to 100 products from suppliers near the seller (verified or not), most trending first. `hasPlace` false: the
 * store has no city yet, so no supplier counts as near (the screen asks for one).
 */
export async function fetchFindProducts(q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim().slice(0, 120));
  const result = await api<{ hasPlace: boolean; city: string | null; products: RawProduct[] }>(`/api/mobile/marketplace/products${params.toString() ? `?${params.toString()}` : ""}`);
  return { hasPlace: result.hasPlace, city: result.city, products: result.products.map(toFindProduct) };
}

/** What the seller does before dropshipping a supplier's products (the web's "Before you sell" steps). */
export type ListingStep = "agree" | "waiting" | "declined" | "ready" | "far" | "noPlace";

export interface Listing {
  step: ListingStep;
  /** The supplier's phone and address, only while the seller still has to call them. */
  phone: string | null;
  address: string | null;
  /** Why the supplier declined. */
  supplierNote: string | null;
}

export async function fetchFindProduct(slug: string) {
  const row = await api<RawProduct & { listing: Listing }>(`/api/mobile/marketplace/products/${encodeURIComponent(slug)}`);
  return { product: toFindProduct(row), listing: row.listing };
}

/** The seller called the supplier, checked the stock and accepts the Dropship agreement: it goes to the supplier. */
export const sendAgreement = (input: { supplierId: string; called: boolean; stockCheck: "visit" | "video"; agreed: boolean; note?: string }) =>
  api<{ message: string }>("/api/mobile/marketplace/agreement", { method: "POST", json: input });

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
