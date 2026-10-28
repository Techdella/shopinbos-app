import { api } from "./api";
import { parsePricingTiers, shipsLabel, shortCategory, type FindTier } from "./find-pure";
import type { PreorderState } from "./preorder-pure";
import type { DropshipTerms } from "@shared/dropship-checkout";
import { dropshipUnitPrice, retailFloor } from "@shared/dropship-rules";
import { quickAddPrice, type Markup } from "@shared/supplier-markup";

// Find products: supplier products from /api/mobile/marketplace/products (the same rows the web's /marketplace
// shows: suppliers near the seller, verified or not, with their risk score), plus the seller's own bits from
// /api/mobile/marketplace (already added, where wholesale ships to), the Dropship agreement before listing
// (call the supplier, check the stock, agree), and "Add to store" / "Request a quote" / "Preorder N for ₦…" (a bulk
// order on a listing that takes preorders: POST /api/app/wholesale/request, the web's own route).

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
  /** Channel prices (newer servers): the dropship price and the lowest allowed retail price. */
  priceMode?: string | null;
  dropshipPrice?: number | null;
  minRetailPrice?: number | null;
  /** The supplier takes preorders (ship date, places left, promise; shared/preorder.ts). Newer servers. `depositPct`:
   * the share paid when the preorder is placed (newer servers; 0 or absent: none). */
  preorder?: (PreorderState & { depositPct?: number }) | null;
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
    /** Track record level: new | trusted | established (newer servers). */
    level?: string | null;
    /** In the seller's state (newer servers). */
    sameState?: boolean;
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
    /** new | trusted | established, and how many shops rated them ("Trusted supplier · ★ 4.7 from 18 shops"). */
    level: string | null;
    ratingCount: number;
    /** In the seller's state ("Delivers to my state"). */
    sameState: boolean;
  };
  /** What the supplier charges per unit (dropship). */
  cost: number;
  /** What the seller pays per piece when they add it (the dropship price for dropship), and the lowest price allowed. */
  addCost: number;
  floor: number | null;
  /** Suggested selling price. */
  price: number;
  ships: string;
  stock: number;
  moq: number;
  tiers: FindTier[];
  dropship: boolean;
  wholesale: boolean;
  trendScore: number;
  /** The supplier takes preorders on it: the stock isn't here yet and ships from their date. Null when not. */
  preorder: (PreorderState & { depositPct?: number }) | null;
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
      level: row.supplier.level ?? null,
      ratingCount: row.supplier.ratingCount ?? 0,
      sameState: row.supplier.sameState === true,
    },
    cost: Number(row.wholesalePrice) || 0,
    addCost: row.dropshipAvailable ? dropshipUnitPrice({ ...row, wholesalePrice: Number(row.wholesalePrice) || 0 }) : Number(row.wholesalePrice) || 0,
    floor: row.dropshipAvailable ? retailFloor({ ...row, wholesalePrice: Number(row.wholesalePrice) || 0 }) : row.minRetailPrice && row.minRetailPrice > 0 ? row.minRetailPrice : null,
    price: Number(row.suggestedRetailPrice) || 0,
    ships: shipsLabel(row.processingTime),
    stock: row.stockQuantity,
    moq: Math.max(1, row.moq),
    tiers: parsePricingTiers(row.pricingTiers),
    dropship: row.dropshipAvailable,
    wholesale: row.bulkOrderAvailable,
    trendScore: row.trendScore,
    preorder: row.preorder?.on ? row.preorder : null,
  };
}

/**
 * Up to 100 products from suppliers near the seller (verified or not), most trending first. `hasPlace` false: the
 * store has no city yet, so no supplier counts as near (the screen asks for one).
 */
export async function fetchFindProducts(q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim().slice(0, 120));
  const result = await api<{ hasPlace: boolean; city: string | null; state?: string | null; products: RawProduct[] }>(`/api/mobile/marketplace/products${params.toString() ? `?${params.toString()}` : ""}`);
  return { hasPlace: result.hasPlace, city: result.city, state: result.state ?? null, products: result.products.map(toFindProduct) };
}

/** The price one tap lists it at: the supplier's suggested price, else cost + the seller's markup (the server decides). */
export const oneTapPrice = (product: FindProduct, markup: Markup | null) => quickAddPrice({ cost: product.addCost, suggested: product.price, minRetail: product.floor, markup }).price;

/** What the seller does before dropshipping a supplier's products (the web's "Before you sell" steps). */
export type ListingStep = "agree" | "waiting" | "declined" | "ready" | "far" | "noPlace";

export interface Listing {
  step: ListingStep;
  /** The supplier's phone and address, only while the seller still has to call them. */
  phone: string | null;
  address: string | null;
  /** Why the supplier declined. */
  supplierNote: string | null;
  /** For the Dropship agreement preview (older servers leave them out). */
  shopName?: string | null;
  shopCity?: string | null;
}

export async function fetchFindProduct(slug: string) {
  const row = await api<RawProduct & { listing: Listing }>(`/api/mobile/marketplace/products/${encodeURIComponent(slug)}`);
  return { product: toFindProduct(row), listing: row.listing };
}

/** The seller called the supplier, checked the stock and signs the Dropship agreement with their name: it goes to the supplier. */
export const sendAgreement = (input: { supplierId: string; called: boolean; stockCheck: "visit" | "video"; agreed: boolean; note?: string; signedName?: string }) =>
  api<{ message: string }>("/api/mobile/marketplace/agreement", { method: "POST", json: input });

export interface FindContext {
  country: string;
  destination: string;
  addedIds: string[];
}

export const fetchFindContext = () => api<FindContext>("/api/mobile/marketplace");

/**
 * The dropship terms of one supplier product for this seller (shared/dropship-checkout.ts DropshipTerms): You pay,
 * the suggested and lowest price, the options, delivery to the seller's customers and the branding on offer. Null
 * when it isn't offered for dropship (or on an older server).
 */
export const fetchDropshipTerms = (productId: string) =>
  api<FindContext & { dropship?: DropshipTerms | null }>(`/api/mobile/marketplace?productId=${encodeURIComponent(productId)}`).then((body) => body.dropship ?? null);

export interface AddToStoreInput {
  supplierProductId: string;
  retailPrice: number;
  /** Who pays the supplier's delivery: the customer (default), the seller (free delivery) or a flat fee. */
  deliveryPayer?: "customer" | "seller" | "flat";
  deliveryFlatFee?: number;
  brandingChoice?: "blind" | "packing_slip" | "stickers";
  sku?: string;
  barcode?: string;
}

/** "Add to store". A price below the supplier's lowest, or one that loses money, answers 409 PRICE_PROBLEM with why. */
export const addToStore = (input: AddToStoreInput) =>
  api<{ storeProductId: string; already: boolean }>("/api/mobile/marketplace", { method: "POST", json: input });

/** A bulk order (here: a preorder on a listing that takes them). The supplier confirms it, then the seller pays them
 *  (Wholesale screen); Shopinbos holds no preorder money. */
export const placeWholesaleOrder = (input: { supplierId: string; supplierProductId: string; quantity: number; deliveryAddress: string }) =>
  api<{ id: string; depositKobo?: number }>("/api/app/wholesale/request", { method: "POST", json: input });

export const requestQuote = (input: { supplierId: string; supplierProductId: string; quantity: number; destination: string; notes?: string }) =>
  api<{ id: string }>("/api/app/supplier-quotes", { method: "POST", json: input });
