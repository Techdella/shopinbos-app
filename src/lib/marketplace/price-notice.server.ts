import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { naira } from "@/lib/marketplace/find";
import { dropshipTermsFor } from "@/lib/marketplace/dropship-listing.server";
import { dropshipUnitPrice } from "@shared/dropship-rules";
import { PRICE_LOSS, listingVerdict, noticeDay, planPriceChange, priceSetOf, readPendingPrice, type PriceChangePlan, type PriceSet } from "@shared/price-notice";

// Supplier price rises on 7 days' notice (shared/price-notice.ts has the rules):
//   - the supplier edit routes (web PATCH /api/supplier/products/[id], the phone's PATCH
//     /api/mobile/supplier/products/[id] and the product form, src/app/actions/supplier.ts) ask supplierPriceEdit
//     what to save: a cut goes live now, a rise on a listed product waits in pendingPrice for 7 days;
//   - every seller listing it is told the day it changes (notifyPriceNotice);
//   - the daily job (/api/cron/price-notices → applyDuePriceChanges) makes due prices live, then checks each shop's
//     live listing: one that would lose money on a sale is paused (taken off the store, never sold at a loss), and
//     the seller gets "Raise to ₦X" (fixPausedListing, one tap in My supplier products).

/** Shops listing this product now (live or draft, not removed). */
export async function listingCount(supplierProductId: string): Promise<number> {
  return db.storeProduct.count({ where: { supplierProductId, status: { not: "archived" } } }).catch(() => 0);
}

type PricedProduct = { id: string; priceMode: string; wholesalePrice: number; dropshipPrice: number | null; pricingTiers: unknown; pendingPrice?: unknown };

export interface SupplierPriceEdit {
  plan: PriceChangePlan;
  /** Spread into the product update: the live prices (old ones while a rise waits) and the pending fields. */
  data: { priceMode: string; wholesalePrice: number; dropshipPrice: number | null; pricingTiers: Prisma.InputJsonValue; pendingPrice?: Prisma.InputJsonValue | typeof Prisma.DbNull; pendingPriceAt?: Date | null };
}

/**
 * What to save for a supplier's price edit. `incoming` holds only the price fields the edit sends (missing ones keep
 * what's live). Old servers without the columns fall back to saving the new price at once.
 */
export async function supplierPriceEdit(product: PricedProduct, incoming: Partial<Pick<PriceSet, "priceMode" | "wholesalePrice" | "dropshipPrice">> & { pricingTiers?: unknown }, now = new Date()): Promise<SupplierPriceEdit> {
  const current = priceSetOf(product);
  const next = priceSetOf({
    priceMode: incoming.priceMode ?? product.priceMode,
    wholesalePrice: incoming.wholesalePrice ?? product.wholesalePrice,
    dropshipPrice: incoming.dropshipPrice !== undefined ? incoming.dropshipPrice : product.dropshipPrice,
    pricingTiers: incoming.pricingTiers !== undefined ? incoming.pricingTiers : product.pricingTiers,
  });
  const plan = planPriceChange({ current, next, pending: readPendingPrice(product.pendingPrice), listings: await listingCount(product.id), now });
  const live = (set: PriceSet) => ({ priceMode: set.priceMode, wholesalePrice: set.wholesalePrice, dropshipPrice: set.dropshipPrice, pricingTiers: set.pricingTiers as unknown as Prisma.InputJsonValue });
  if (plan.kind === "notice") return { plan, data: { ...live(current), pendingPrice: plan.pending as unknown as Prisma.InputJsonValue, pendingPriceAt: plan.effectiveAt } };
  if (plan.kind === "now") return { plan, data: { ...live(plan.live), pendingPrice: Prisma.DbNull, pendingPriceAt: null } };
  return { plan, data: live(current) };
}

/** The pending price as the supplier screens show it: "₦6,500 from Mon 3 Nov" (null when nothing waits). */
export function pendingPriceView(product: { pendingPrice?: unknown; pendingPriceAt?: Date | null }): { wholesalePrice: number; dropshipPrice: number; at: string } | null {
  const pending = readPendingPrice(product.pendingPrice);
  if (!pending || !product.pendingPriceAt) return null;
  return { wholesalePrice: pending.wholesalePrice, dropshipPrice: dropshipUnitPrice(pending), at: product.pendingPriceAt.toISOString() };
}

/** Tells every seller who lists the product (once per rise) what changes and when. Never throws. */
export async function notifyPriceNotice(productId: string, now = new Date()): Promise<number> {
  try {
    const product = await db.supplierProduct.findUnique({
      where: { id: productId },
      select: { id: true, name: true, priceMode: true, wholesalePrice: true, dropshipPrice: true, pricingTiers: true, pendingPrice: true, pendingPriceAt: true },
    });
    const pending = readPendingPrice(product?.pendingPrice);
    if (!product || !pending || !product.pendingPriceAt || product.pendingPriceAt <= now) return 0;
    const listings = await db.storeProduct.findMany({ where: { supplierProductId: productId, status: { not: "archived" } }, select: { id: true, userId: true, name: true }, take: 2000 });
    const from = dropshipUnitPrice(priceSetOf(product));
    const to = dropshipUnitPrice(pending);
    const day = noticeDay(product.pendingPriceAt);
    const sellers = new Map(listings.map((row) => [row.userId, row]));
    for (const [userId, row] of sellers) {
      await notify({
        userId,
        event: "price_notice.scheduled",
        priority: "warning",
        title: `${row.name}: the supplier's price goes up on ${day}`,
        description: `You'll pay ${naira(to)} instead of ${naira(from)} per piece from ${day}. Orders before then cost the old price. Check your price: if a sale would lose money then, Shopinbos pauses the product instead of selling at a loss.`,
        link: "/marketplace/mine",
        actionLabel: "Check my price",
        actionUrl: "/marketplace/mine",
        metadata: { supplierProductId: productId, storeProductId: row.id, effectiveAt: product.pendingPriceAt.toISOString() },
        dedupeKey: `price_notice:${productId}:${product.pendingPriceAt.toISOString()}:${userId}`,
        email: true,
      }).catch(() => null);
    }
    return sellers.size;
  } catch (error) {
    console.error("[price notice] could not tell the sellers", error);
    return 0;
  }
}

const listingSelect = {
  id: true, storeId: true, userId: true, name: true, status: true, retailPrice: true, deliveryPayer: true, deliveryFlatFee: true, brandingChoice: true, fulfillmentType: true, pausedReason: true,
} as const;

/**
 * After a supplier's price changed: each shop's live dropship listing is checked at the new price with the
 * seller's own delivery and branding choices. Losing ones are paused (off the store, the dropship link paused) with
 * the one-tap fix; the rest get the new cost recorded. Returns how many were paused.
 */
export async function reviewListingsAfterPriceChange(supplierProductId: string, now = new Date()): Promise<{ checked: number; paused: number }> {
  const product = await db.supplierProduct.findUnique({
    where: { id: supplierProductId },
    select: { id: true, supplierId: true, name: true, wholesalePrice: true, suggestedRetailPrice: true, priceMode: true, dropshipPrice: true, preorderPrice: true, pricingTiers: true, minRetailPrice: true, dropshipMinQty: true, handlingDays: true, sizeBand: true, sampleAvailable: true, stockQuantity: true },
  });
  if (!product) return { checked: 0, paused: 0 };
  const listings = await db.storeProduct.findMany({ where: { supplierProductId, status: "published", fulfillmentType: "dropship" }, select: listingSelect, take: 2000 });
  let paused = 0;
  for (const listing of listings) {
    const terms = (await dropshipTermsFor([product], listing.userId)).get(product.id);
    if (!terms) continue;
    const verdict = listingVerdict(terms, { retailPrice: listing.retailPrice, payer: listing.deliveryPayer, flatFee: listing.deliveryFlatFee, brandingChoice: listing.brandingChoice });
    if (!verdict.loses) {
      await db.storeProduct.update({ where: { id: listing.id }, data: { costPrice: terms.cost, margin: listing.retailPrice - terms.cost } }).catch(() => null);
      continue;
    }
    const done = await db.$transaction([
      db.storeProduct.updateMany({ where: { id: listing.id, status: "published" }, data: { status: "draft", pausedReason: PRICE_LOSS, pausedAt: now, costPrice: terms.cost, margin: listing.retailPrice - terms.cost } }),
      db.dropshipRelationship.updateMany({ where: { storeProductId: listing.id, status: "active" }, data: { status: "paused" } }),
    ]).catch(() => null);
    if (!done || done[0].count !== 1) continue;
    paused += 1;
    void import("@/lib/whatsapp-catalog/dirty").then((dirty) => dirty.markCatalogDirty(listing.storeId)).catch(() => undefined);
    await notify({
      userId: listing.userId,
      event: "listing.paused_price",
      priority: "warning",
      title: `${listing.name} is paused: it would lose money`,
      description: `The supplier's new price is ${naira(terms.cost)} per piece, so at ${naira(listing.retailPrice)} you'd lose ${naira(Math.abs(verdict.earn))} on a sale. We took it off your store instead of selling at a loss. Raise it to ${naira(verdict.fixPrice)} to sell it again.`,
      link: `/marketplace/mine?fix=${listing.id}`,
      actionLabel: `Raise to ${naira(verdict.fixPrice)}`,
      actionUrl: `/marketplace/mine?fix=${listing.id}`,
      metadata: { storeProductId: listing.id, supplierProductId, fixPrice: verdict.fixPrice },
      dedupeKey: `listing.paused_price:${listing.id}:${now.toISOString().slice(0, 10)}`,
      email: true,
    }).catch(() => null);
  }
  return { checked: listings.length, paused };
}

/**
 * The daily job: makes every waiting price that is due live (each claimed once, so two runs never apply twice),
 * then reviews the shops' listings of it. Idempotent.
 */
export async function applyDuePriceChanges(now = new Date(), limit = 200): Promise<{ applied: number; paused: number }> {
  const due = await db.supplierProduct.findMany({
    where: { pendingPriceAt: { lte: now } },
    select: { id: true, slug: true, pendingPrice: true, pendingPriceAt: true },
    orderBy: { pendingPriceAt: "asc" },
    take: limit,
  });
  let applied = 0;
  let paused = 0;
  for (const row of due) {
    const pending = readPendingPrice(row.pendingPrice);
    const claimed = await db.supplierProduct.updateMany({
      where: { id: row.id, pendingPriceAt: row.pendingPriceAt },
      data: pending
        ? { priceMode: pending.priceMode, wholesalePrice: pending.wholesalePrice, dropshipPrice: pending.dropshipPrice, pricingTiers: pending.pricingTiers as unknown as Prisma.InputJsonValue, pendingPrice: Prisma.DbNull, pendingPriceAt: null }
        : { pendingPrice: Prisma.DbNull, pendingPriceAt: null },
    });
    if (claimed.count !== 1 || !pending) continue;
    applied += 1;
    paused += (await reviewListingsAfterPriceChange(row.id, now).catch((error) => {
      console.error("[price notice] could not review listings", row.id, error);
      return { paused: 0 };
    })).paused;
  }
  if (applied) void import("@/lib/api/cache").then((cache) => cache.invalidatePublicMarketplaceCache({})).catch(() => undefined);
  return { applied, paused };
}

export type FixResult = { ok: true; price: number } | { ok: false; code: "NOT_FOUND" | "NOT_PAUSED"; message: string };

/**
 * "Raise to ₦X": the seller's one tap on a listing paused for a price loss. Sets the lowest nice price that no
 * longer loses money (worked out again now, from the supplier's live price) and puts it back on the store.
 */
export async function fixPausedListing(userId: string, storeProductId: string): Promise<FixResult> {
  const listing = await db.storeProduct.findFirst({
    where: { id: storeProductId, userId, status: { not: "archived" } },
    select: { ...listingSelect, supplierProduct: { select: { id: true, supplierId: true, wholesalePrice: true, suggestedRetailPrice: true, priceMode: true, dropshipPrice: true, preorderPrice: true, pricingTiers: true, minRetailPrice: true, dropshipMinQty: true, handlingDays: true, sizeBand: true, sampleAvailable: true, stockQuantity: true } } },
  });
  if (!listing?.supplierProduct) return { ok: false, code: "NOT_FOUND", message: "This product isn't in your shop any more." };
  if (listing.pausedReason !== PRICE_LOSS) return { ok: false, code: "NOT_PAUSED", message: "This product isn't paused for its price." };
  const terms = (await dropshipTermsFor([listing.supplierProduct], userId)).get(listing.supplierProduct.id);
  if (!terms) return { ok: false, code: "NOT_FOUND", message: "This product isn't available any more." };
  const verdict = listingVerdict(terms, { retailPrice: listing.retailPrice, payer: listing.deliveryPayer, flatFee: listing.deliveryFlatFee, brandingChoice: listing.brandingChoice });
  const price = verdict.loses ? verdict.fixPrice : listing.retailPrice;
  await db.$transaction([
    db.storeProduct.update({ where: { id: listing.id }, data: { retailPrice: price, costPrice: terms.cost, margin: price - terms.cost, status: "published", pausedReason: null, pausedAt: null } }),
    db.dropshipRelationship.updateMany({ where: { storeProductId: listing.id, status: "paused" }, data: { status: "active" } }),
  ]);
  void import("@/lib/whatsapp-catalog/dirty").then((dirty) => dirty.markCatalogDirty(listing.storeId)).catch(() => undefined);
  return { ok: true, price };
}

/** For My supplier products: the fix price of each listing paused for a price loss (by StoreProduct id). */
export async function fixPricesFor(userId: string, rows: ReadonlyArray<{ id: string; pausedReason: string | null; retailPrice: number; deliveryPayer: string; deliveryFlatFee: number | null; brandingChoice: string; supplierProduct: Parameters<typeof dropshipTermsFor>[0][number] | null }>): Promise<Map<string, number>> {
  const paused = rows.filter((row) => row.pausedReason === PRICE_LOSS && row.supplierProduct);
  const out = new Map<string, number>();
  if (!paused.length) return out;
  const terms = await dropshipTermsFor(paused.map((row) => row.supplierProduct!), userId).catch(() => new Map());
  for (const row of paused) {
    const productTerms = terms.get(row.supplierProduct!.id);
    if (productTerms) out.set(row.id, listingVerdict(productTerms, { retailPrice: row.retailPrice, payer: row.deliveryPayer, flatFee: row.deliveryFlatFee, brandingChoice: row.brandingChoice }).fixPrice);
  }
  return out;
}
