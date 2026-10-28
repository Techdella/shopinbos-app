import "server-only";

import { z } from "zod";
import { db } from "@/lib/db/client";
import { originOf, DEFAULT_SETTINGS } from "@/lib/delivery-market/market.server";
import { canonicalState, placeOf, type Place } from "@shared/delivery-market";
import { BRANDING_CHOICES, DELIVERY_PAYERS } from "@shared/dropship-rules";
import { cleanListingChoice, dropshipTerms, listingProblem, type DropshipTerms } from "@shared/dropship-checkout";

// A seller adding a supplier's dropship product to their store (the owner's "Supplier & Dropship Rules"): what they
// pay (the dropship price), the lowest price allowed, the delivery they might cover (free delivery or a flat fee),
// the branding the supplier offers, and the check that refuses a price below the supplier's floor or one that would
// lose money. Shared by the web action (src/app/actions/sourcing.ts), the seller API
// (/api/app/store-products/add-from-supplier) and the phone app (/api/mobile/marketplace).

/** The optional choices the seller sends with "Add to store". */
export const ListingChoiceSchema = z.object({
  deliveryPayer: z.enum(DELIVERY_PAYERS).optional(),
  deliveryFlatFee: z.number().min(0).max(1_000_000).nullable().optional(),
  brandingChoice: z.enum(BRANDING_CHOICES).optional(),
  /** "Your SKU or barcode": prints on the packing slip and shows in the supplier's order list. */
  sku: z.string().trim().max(64).optional(),
  barcode: z.string().trim().max(64).optional(),
});
export type ListingChoiceInput = z.infer<typeof ListingChoiceSchema>;

type TermsProduct = Parameters<typeof dropshipTerms>[0]["product"] & { id: string; supplierId: string };

/** Where the seller is: their delivery settings' origin, else their store's city. */
async function sellerPlaceOf(sellerUserId: string): Promise<Place | null> {
  const [settings, store] = await Promise.all([
    db.deliverySettings.findUnique({ where: { userId: sellerUserId }, select: { originState: true, originArea: true } }),
    db.store.findUnique({ where: { userId: sellerUserId }, select: { city: true } }),
  ]);
  if (settings?.originState) return { state: canonicalState(settings.originState), area: settings.originArea || store?.city || null };
  const place = placeOf({ city: store?.city ?? "" });
  return place.state ? place : null;
}

/** The terms for these products (one query per table), for the product page, the API and the add check. */
export async function dropshipTermsFor(products: readonly TermsProduct[], sellerUserId: string | null): Promise<Map<string, DropshipTerms>> {
  const out = new Map<string, DropshipTerms>();
  if (!products.length) return out;
  const supplierIds = [...new Set(products.map((product) => product.supplierId))];
  const [suppliers, sellerPlace] = await Promise.all([
    db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, userId: true, city: true, level: true, brandingOffer: true } }),
    sellerUserId ? sellerPlaceOf(sellerUserId) : Promise.resolve(null),
  ]);
  const settings = suppliers.length ? await db.deliverySettings.findMany({ where: { userId: { in: suppliers.map((supplier) => supplier.userId) } } }) : [];
  for (const product of products) {
    const supplier = suppliers.find((row) => row.id === product.supplierId);
    if (!supplier) continue;
    const delivery = settings.find((row) => row.userId === supplier.userId) ?? null;
    out.set(
      product.id,
      dropshipTerms({
        product,
        supplier,
        delivery,
        origin: originOf(delivery ?? DEFAULT_SETTINGS, supplier.city),
        sellerPlace,
      }),
    );
  }
  return out;
}

export type ListingCheck =
  | { ok: true; retailPrice: number; costPrice: number; deliveryPayer: string; deliveryFlatFee: number | null; brandingChoice: string; terms: DropshipTerms }
  | { ok: false; code: "PRICE_PROBLEM"; message: string; terms: DropshipTerms };

/**
 * The dropship price check for "Add to store": the price (the seller's, else the supplier's suggestion, never below
 * the lowest allowed) and the seller's choices, refused when below the supplier's floor or when it would lose money
 * on the dearest delivery they could have to cover.
 */
export async function checkDropshipListing(
  product: TermsProduct,
  sellerUserId: string,
  input: { retailPrice?: number | null } & ListingChoiceInput,
  /** The seller's stepper rules (src/lib/marketplace/find.ts clampSellingPrice), applied to the price first. */
  clamp: (price: number, cost: number) => number = (price) => price,
): Promise<ListingCheck> {
  const terms = (await dropshipTermsFor([product], sellerUserId)).get(product.id)!;
  const asked = typeof input.retailPrice === "number" && input.retailPrice > 0;
  const retailPrice = asked ? clamp(input.retailPrice!, terms.cost) : Math.max(terms.floor, clamp(terms.suggestedPrice, terms.cost));
  const choice = { retailPrice, payer: input.deliveryPayer, flatFee: input.deliveryFlatFee, brandingChoice: input.brandingChoice };
  const problem = listingProblem(terms, choice);
  if (problem) return { ok: false, code: "PRICE_PROBLEM", message: problem, terms };
  const clean = cleanListingChoice(terms, choice);
  return { ok: true, retailPrice, costPrice: terms.cost, deliveryPayer: clean.payer, deliveryFlatFee: clean.flatFee, brandingChoice: clean.brandingChoice, terms };
}

/** The seller's own SKU / barcode fields for the new store product (empty strings dropped). */
export function skuFields(input: ListingChoiceInput): { sku?: string; barcode?: string } {
  return { ...(input.sku ? { sku: input.sku } : {}), ...(input.barcode ? { barcode: input.barcode } : {}) };
}
