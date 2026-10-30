import "server-only";
import { db } from "@/lib/db/client";
import { saleBreakdown, shipsLabel } from "./find";
import { dropshipTermsFor } from "./dropship-listing.server";
import { PRICE_LOSS, listingVerdict } from "@shared/price-notice";
import { listingProblem } from "@shared/dropship-checkout";

// The seller's dropship products (web /home/dropship and the mobile app), and pausing / resuming one.

export async function listDropship(sellerId: string) {
  const relationships = await db.dropshipRelationship.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    take: 120,
    include: {
      supplier: { select: { id: true, userId: true, displayName: true, city: true } },
      supplierProduct: { select: { name: true, wholesalePrice: true, stockQuantity: true, processingTime: true, images: true } },
      storeProduct: { select: { id: true, name: true, status: true, images: true, retailPrice: true } },
    },
  });
  return relationships.map((r) => {
    const sale = saleBreakdown(r.storeProduct.retailPrice, r.supplierProduct.wholesalePrice);
    const paused = r.status === "paused";
    return {
      id: r.id,
      paused,
      live: !paused && r.storeProduct.status === "published",
      product: { id: r.storeProduct.id, name: r.storeProduct.name, status: r.storeProduct.status },
      image: r.storeProduct.images[0] || r.supplierProduct.images[0] || null,
      supplier: { id: r.supplier.id, userId: r.supplier.userId, name: r.supplier.displayName, city: r.supplier.city },
      ships: shipsLabel(r.supplierProduct.processingTime),
      stock: r.supplierProduct.stockQuantity,
      sale,
    };
  });
}

export type DropshipItem = Awaited<ReturnType<typeof listDropship>>[number];

/** The answer when the seller resumes a product Shopinbos paused because it would lose money at the supplier's new price. */
export const STILL_LOSES = "It would still lose money at the supplier's new price. Raise your price first (My supplier products: Raise to ₦…).";

/**
 * Pausing takes the product off the store; resuming publishes it again. Null when it isn't the seller's; "loss" when
 * it was paused for a price loss (shared/price-notice.ts) and the seller's price still loses money: it stays paused.
 */
export async function setDropshipPausedFor(sellerId: string, relationshipId: string, pause: boolean): Promise<"active" | "paused" | "loss" | null> {
  const link = await db.dropshipRelationship.findUnique({ where: { id: relationshipId }, select: { id: true, sellerId: true, storeProductId: true, storeProduct: { select: { pausedReason: true } } } });
  if (!link || link.sellerId !== sellerId) return null;
  if (!pause && link.storeProduct.pausedReason === PRICE_LOSS) {
    const losing = await stillLoses(sellerId, link.storeProductId);
    if (losing) return "loss";
  }
  const status = pause ? "paused" : "active";
  await db.$transaction([
    db.dropshipRelationship.update({ where: { id: link.id }, data: { status } }),
    db.storeProduct.update({ where: { id: link.storeProductId }, data: { status: pause ? "draft" : "published", ...(pause ? {} : { pausedReason: null, pausedAt: null }) } }),
  ]);
  return status as "active" | "paused";
}

/** True when this listing would lose money at the supplier's live price with the seller's own choices. */
async function stillLoses(sellerId: string, storeProductId: string): Promise<boolean> {
  const listing = await db.storeProduct.findUnique({
    where: { id: storeProductId },
    select: { retailPrice: true, deliveryPayer: true, deliveryFlatFee: true, supplierProduct: { select: { id: true, supplierId: true, wholesalePrice: true, suggestedRetailPrice: true, priceMode: true, dropshipPrice: true, preorderPrice: true, pricingTiers: true, minRetailPrice: true, dropshipMinQty: true, handlingDays: true, sizeBand: true, sampleAvailable: true, stockQuantity: true } } },
  });
  if (!listing?.supplierProduct) return false;
  const terms = (await dropshipTermsFor([listing.supplierProduct], sellerId)).get(listing.supplierProduct.id);
  return terms ? listingVerdict(terms, { retailPrice: listing.retailPrice, payer: listing.deliveryPayer, flatFee: listing.deliveryFlatFee }).loses : false;
}

/**
 * Why a new price for a dropship listing can't be saved from the product editor, or null: below the supplier's lowest
 * price, or losing money on the dearest delivery the seller could have to cover (the same check as "Add to store",
 * so editing the price later can't undo the floor or the price-notice pause, shared/price-notice.ts).
 */
export async function dropshipPriceProblem(sellerId: string, storeProductId: string, retailPrice: number): Promise<string | null> {
  const listing = await db.storeProduct.findUnique({
    where: { id: storeProductId },
    select: { deliveryPayer: true, deliveryFlatFee: true, supplierProduct: { select: { id: true, supplierId: true, wholesalePrice: true, suggestedRetailPrice: true, priceMode: true, dropshipPrice: true, preorderPrice: true, pricingTiers: true, minRetailPrice: true, dropshipMinQty: true, handlingDays: true, sizeBand: true, sampleAvailable: true, stockQuantity: true } } },
  });
  if (!listing?.supplierProduct) return null;
  const terms = (await dropshipTermsFor([listing.supplierProduct], sellerId)).get(listing.supplierProduct.id);
  return terms ? listingProblem(terms, { retailPrice, payer: listing.deliveryPayer, flatFee: listing.deliveryFlatFee }) : null;
}
