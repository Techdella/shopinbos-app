import "server-only";
import { fixPricesFor, pendingPriceView } from "./price-notice.server";
import { PRICE_LOSS } from "@shared/price-notice";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { mergeBrandSettings } from "@/lib/workspace";
import { sellerPlan } from "@/lib/plans/gates.server";
import { withShortCode } from "@/lib/products/short-code.server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { VISIBLE_SUPPLIER, listingCheck, nearbyForSeller } from "@/lib/marketplace/agreements.server";
import { dropshipTermsFor, sellerPlaceOf } from "@/lib/marketplace/dropship-listing.server";
import { parseSourcing, shortCategory } from "@/lib/marketplace/find";
import { runQuickAdd, type NewListing, type QuickAddResult, type QuickProduct } from "@/lib/marketplace/quick-add-core";
import { placeOf } from "@shared/delivery-market";
import { dropshipUnitPrice, retailFloor } from "@shared/dropship-rules";
import { listingProblem } from "@shared/dropship-checkout";
import { DEFAULT_MARKUP, quickAddPrice, readMarkup, type Markup } from "@shared/supplier-markup";
import { starterPacks, type PackCandidate, type StarterPack } from "@shared/starter-packs";

// Finding supplier products to sell, made quick (the owner: "a seller has 200 products; simplify adding them"):
//   - the seller's markup ("Add 30% to supplier prices"), kept in Store.brandSettings.sourcing.markup (no new
//     column); 30% until they pick, and `asked` says whether they have;
//   - one-tap and bulk "Add to my shop" (quick-add-core.ts has the rules), each product made under a per-store
//     advisory lock with a re-check, so a second tap, a retry or another phone never adds a duplicate;
//   - Undo for a just-added draft, and "My supplier products": change the price or markup of many, or remove them;
//   - starter packs worked out from the products the seller can see (shared/starter-packs.ts).
// Used by the phone routes (/api/mobile/marketplace/{quick-add,markup,packs,mine}) and the web actions
// (src/app/actions/quick-add.ts).

/** How long after adding a product "Undo" can still take it out again. */
export const UNDO_MINUTES = 30;
/** My supplier products shows at most this many (newest first). */
export const MINE_MAX = 600;

async function storeOf(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, city: true, country: true, brandSettings: true } });
}

const settingsOf = (brandSettings: unknown) => (brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {});

/** The seller's markup, and whether they picked one (else they're asked the first time they add). */
export async function sellerMarkup(userId: string): Promise<{ markup: Markup; asked: boolean } | null> {
  const store = await storeOf(userId);
  if (!store) return null;
  const saved = parseSourcing(settingsOf(store.brandSettings).sourcing).markup ?? null;
  return { markup: saved ?? DEFAULT_MARKUP, asked: Boolean(saved) };
}

export async function saveSellerMarkup(userId: string, value: unknown): Promise<{ ok: true; markup: Markup } | { ok: false; code: "NOT_FOUND" | "BAD_REQUEST" }> {
  const markup = readMarkup(value);
  if (!markup) return { ok: false, code: "BAD_REQUEST" };
  const store = await storeOf(userId);
  if (!store) return { ok: false, code: "NOT_FOUND" };
  const sourcing = parseSourcing(settingsOf(store.brandSettings).sourcing);
  await db.store.update({ where: { id: store.id }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { sourcing: JSON.parse(JSON.stringify({ ...sourcing, markup })) }) } });
  return { ok: true, markup };
}

const productSelect = {
  id: true, name: true, description: true, images: true, currency: true, categoryId: true, supplierId: true, stockQuantity: true,
  wholesalePrice: true, suggestedRetailPrice: true, priceMode: true, dropshipPrice: true, preorderPrice: true, minRetailPrice: true, pricingTiers: true,
  dropshipAvailable: true, dropshipMinQty: true, handlingDays: true, sizeBand: true, sampleAvailable: true,
  preorderEnabled: true, preorderLimit: true, preorderTaken: true,
  supplier: { select: { id: true, displayName: true, verificationStatus: true } },
} satisfies Prisma.SupplierProductSelect;
type Row = Prisma.SupplierProductGetPayload<{ select: typeof productSelect }>;

const quickProductOf = (row: Row): QuickProduct => ({
  id: row.id,
  name: row.name,
  supplierId: row.supplierId,
  supplierName: row.supplier.displayName,
  verified: row.supplier.verificationStatus === "verified",
  dropship: row.dropshipAvailable,
  stock: row.stockQuantity,
  preorderOpen: row.preorderEnabled && (row.preorderLimit == null || row.preorderTaken < row.preorderLimit),
  wholesalePrice: row.wholesalePrice,
  suggested: row.suggestedRetailPrice,
  minRetail: row.minRetailPrice && row.minRetailPrice > 0 ? row.minRetailPrice : null,
});

/** Takes the store's lock for the rest of the transaction: one supplier product is linked once, whoever adds it. */
const lockStore = (tx: Prisma.TransactionClient, storeId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`supplier-add:${storeId}`}))`;

/**
 * Makes the draft store product linked to a supplier product (and its dropship link), unless the store already has
 * one: checked again under the store's lock. Every "Add to store" path uses it (web, phone, one-tap, bulk).
 */
export async function linkSupplierProduct(input: {
  storeId: string;
  userId: string;
  product: { id: string; name: string; description: string; images: string[]; currency: string; categoryId: string | null; supplierId: string; stockQuantity: number };
  retailPrice: number;
  costPrice: number;
  dropship: boolean;
  deliveryPayer?: string | null;
  deliveryFlatFee?: number | null;
  brandingChoice?: string | null;
  sku?: string;
  barcode?: string;
}): Promise<{ storeProductId: string; already: boolean }> {
  const { storeId, product, dropship } = input;
  // withShortCode retries the whole locked transaction with the next code when another product took this one.
  return withShortCode(storeId, { name: product.name, categoryId: product.categoryId }, (shortCode) => db.$transaction(async (tx) => {
    await lockStore(tx, storeId);
    const existing = await tx.storeProduct.findFirst({ where: { storeId, supplierProductId: product.id }, select: { id: true, status: true }, orderBy: { createdAt: "asc" } });
    if (existing && existing.status !== "archived") return { storeProductId: existing.id, already: true };
    if (existing) {
      // Removed earlier: it comes back as a draft at the new price, with its dropship link on again.
      await tx.storeProduct.update({ where: { id: existing.id }, data: { status: "draft", retailPrice: input.retailPrice, costPrice: input.costPrice, margin: input.retailPrice - input.costPrice } });
      await tx.dropshipRelationship.updateMany({ where: { storeProductId: existing.id }, data: { status: "active" } });
      return { storeProductId: existing.id, already: false };
    }
    const made = await tx.storeProduct.create({
      data: {
        storeId,
        userId: input.userId,
        supplierProductId: product.id,
        name: product.name,
        shortCode,
        description: product.description,
        images: product.images,
        retailPrice: input.retailPrice,
        costPrice: input.costPrice,
        currency: product.currency,
        margin: input.retailPrice - input.costPrice,
        ...(dropship ? { deliveryPayer: input.deliveryPayer ?? "customer", deliveryFlatFee: input.deliveryFlatFee ?? null, brandingChoice: input.brandingChoice ?? "blind" } : {}),
        ...(input.sku ? { sku: input.sku } : {}),
        ...(input.barcode ? { barcode: input.barcode } : {}),
        categoryId: product.categoryId,
        fulfillmentType: dropship ? "dropship" : "merchant_fulfilled",
        inventoryType: dropship ? "dropshipping" : "seller",
        sourceType: dropship ? "dropship" : "supplier",
        supplierStock: product.stockQuantity,
        supplierLastSync: new Date(),
        status: "draft",
      },
      select: { id: true },
    });
    if (dropship) {
      await tx.dropshipRelationship.create({ data: { sellerId: input.userId, storeId, supplierId: product.supplierId, supplierProductId: product.id, storeProductId: made.id } });
    }
    return { storeProductId: made.id, already: false };
  }));
}

async function markProductAdded(store: { id: string; brandSettings: unknown }, userId: string, firstId: string) {
  await db.store.update({ where: { id: store.id }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { setup: { productAdded: true } }) } }).catch(() => null);
  // One reward event per request: a pack of 25 is one "product added", not 25.
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId, kind: "product_added", ref: firstId })).catch(() => undefined);
}

/**
 * One-tap or bulk "Add to my shop" (at most QUICK_ADD_MAX ids). The markup sent with it (when the seller just picked
 * one) is saved first; else the saved one, else 30%. Null when the seller has no store yet.
 */
export async function quickAddForSeller(userId: string, ids: readonly unknown[], markupInput?: unknown): Promise<(QuickAddResult & { markup: Markup }) | null> {
  const store = await storeOf(userId);
  if (!store) return null;
  const sent = readMarkup(markupInput);
  if (sent) await saveSellerMarkup(userId, sent);
  const markup = sent ?? parseSourcing(settingsOf(store.brandSettings).sourcing).markup ?? DEFAULT_MARKUP;
  const rows = new Map<string, Row>();

  const result = await runQuickAdd(
    {
      products: async (list) => {
        const found = await db.supplierProduct.findMany({ where: { id: { in: list }, status: "published", supplier: VISIBLE_SUPPLIER }, select: productSelect });
        for (const row of found) rows.set(row.id, row);
        return found.map(quickProductOf);
      },
      existing: async (list) => {
        const linked = await db.storeProduct.findMany({ where: { storeId: store.id, supplierProductId: { in: list } }, select: { id: true, supplierProductId: true, status: true }, orderBy: { createdAt: "asc" } });
        const seen = new Set<string>();
        return linked.flatMap((row) => {
          if (!row.supplierProductId || seen.has(row.supplierProductId)) return [];
          seen.add(row.supplierProductId);
          return [{ supplierProductId: row.supplierProductId, storeProductId: row.id, archived: row.status === "archived" }];
        });
      },
      gate: (supplierId) => listingCheck(userId, supplierId),
      terms: (products) => dropshipTermsFor(products.map((product) => rows.get(product.id)!).filter(Boolean), userId),
      room: async () => {
        const { limits } = await sellerPlan(userId);
        const [have, haveDropship] = await Promise.all([
          db.storeProduct.count({ where: { storeId: store.id, status: { not: "archived" } } }),
          db.storeProduct.count({ where: { storeId: store.id, fulfillmentType: "dropship", status: { not: "archived" } } }),
        ]);
        return { products: limits.products, dropship: limits.dropshipProducts, have, haveDropship };
      },
      create: (listing: NewListing) => {
        const row = rows.get(listing.product.id)!;
        return linkSupplierProduct({ storeId: store.id, userId, product: row, retailPrice: listing.retailPrice, costPrice: listing.costPrice, dropship: listing.dropship, deliveryPayer: listing.deliveryPayer, deliveryFlatFee: listing.deliveryFlatFee, brandingChoice: listing.brandingChoice });
      },
      restore: async (storeProductId, listing) => {
        await db.$transaction([
          db.storeProduct.update({ where: { id: storeProductId }, data: { status: "draft", retailPrice: listing.retailPrice, costPrice: listing.costPrice, margin: listing.retailPrice - listing.costPrice } }),
          db.dropshipRelationship.updateMany({ where: { storeProductId }, data: { status: "active" } }),
        ]);
      },
    },
    { ids, markup },
  );
  if (result.added.length) await markProductAdded(store, userId, result.added[0].storeProductId);
  return { ...result, markup };
}

/** "Undo" right after adding: takes these just-added drafts out again (only drafts added in the last UNDO_MINUTES). */
export async function undoQuickAdd(userId: string, storeProductIds: readonly string[]): Promise<{ removed: number } | null> {
  const store = await storeOf(userId);
  if (!store) return null;
  const since = new Date(Date.now() - UNDO_MINUTES * 60_000);
  const rows = await db.storeProduct.findMany({
    where: { id: { in: [...new Set(storeProductIds)].slice(0, 200) }, storeId: store.id, supplierProductId: { not: null }, status: "draft", createdAt: { gte: since } },
    select: { id: true },
  });
  let removed = 0;
  for (const row of rows) {
    try {
      await db.$transaction([db.dropshipRelationship.deleteMany({ where: { storeProductId: row.id } }), db.storeProduct.delete({ where: { id: row.id } })]);
    } catch {
      // Something already points at it (a collection, a stock movement): archive it instead.
      await db.storeProduct.update({ where: { id: row.id }, data: { status: "archived" } });
      await db.dropshipRelationship.updateMany({ where: { storeProductId: row.id }, data: { status: "ended" } });
    }
    removed += 1;
  }
  return { removed };
}

// ─── My supplier products ─────────────────────────────────────────────────────

export interface MySupplierProduct {
  id: string;
  supplierProductId: string;
  name: string;
  image: string | null;
  status: string;
  dropship: boolean;
  supplierName: string;
  /** Your price, and what you pay the supplier now. */
  price: number;
  cost: number;
  /** The supplier's lowest allowed price (dropship), else null. */
  lowest: number | null;
  stock: number;
  /** The supplier stopped selling it, or it's out of stock. */
  unavailable: boolean;
  /** Shopinbos paused it because the supplier's new price makes a sale lose money (shared/price-notice.ts). */
  pausedForPrice: boolean;
  /** "Raise to ₦X": the lowest nice price that sells it again without a loss (paused ones only). */
  fixPrice: number | null;
  /** The supplier's price rise on notice: what you'll pay per piece and from when (ISO), or null. */
  priceChange: { cost: number; at: string } | null;
}

export async function mySupplierProducts(userId: string): Promise<{ products: MySupplierProduct[]; markup: Markup; asked: boolean } | null> {
  const store = await storeOf(userId);
  if (!store) return null;
  const rows = await db.storeProduct.findMany({
    where: { storeId: store.id, supplierProductId: { not: null }, status: { not: "archived" } },
    select: {
      id: true, name: true, images: true, status: true, retailPrice: true, costPrice: true, fulfillmentType: true, supplierProductId: true,
      pausedReason: true, deliveryPayer: true, deliveryFlatFee: true, brandingChoice: true,
      supplierProduct: { select: { ...productSelect, status: true, pendingPrice: true, pendingPriceAt: true, supplier: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: MINE_MAX,
  });
  const saved = parseSourcing(settingsOf(store.brandSettings).sourcing).markup ?? null;
  // Paused for a price loss: the one-tap fix price (src/lib/marketplace/price-notice.server.ts).
  const fixes = await fixPricesFor(userId, rows).catch(() => new Map<string, number>());
  return {
    markup: saved ?? DEFAULT_MARKUP,
    asked: Boolean(saved),
    products: rows.map((row) => {
      const source = row.supplierProduct;
      const dropship = row.fulfillmentType === "dropship";
      const cost = source ? (dropship ? dropshipUnitPrice(source) : source.wholesalePrice) : row.costPrice ?? 0;
      return {
        id: row.id,
        supplierProductId: row.supplierProductId!,
        name: row.name,
        image: row.images[0] ?? null,
        status: row.status,
        dropship,
        supplierName: source?.supplier.displayName ?? "",
        price: row.retailPrice,
        cost,
        lowest: source && dropship ? retailFloor(source) : null,
        stock: source?.stockQuantity ?? 0,
        unavailable: !source || source.status !== "published" || source.stockQuantity <= 0,
        pausedForPrice: row.pausedReason === PRICE_LOSS,
        fixPrice: fixes.get(row.id) ?? null,
        priceChange: (() => {
          const view = source ? pendingPriceView(source) : null;
          return view ? { cost: dropship ? view.dropshipPrice : view.wholesalePrice, at: view.at } : null;
        })(),
      };
    }),
  };
}

export type Reprice = { mode: "markup"; markup: Markup } | { mode: "suggested" };

/**
 * Sets the price of many supplier products at once: cost + a markup (rounded to nice prices), or the supplier's
 * suggested price. Each still respects the supplier's lowest price and, for dropship, a loss on the seller's own
 * delivery and branding choices; those that can't are skipped with why.
 */
export async function repriceSupplierProducts(userId: string, ids: readonly string[], change: Reprice) {
  const store = await storeOf(userId);
  if (!store) return null;
  const rows = await db.storeProduct.findMany({
    where: { id: { in: [...new Set(ids)].slice(0, MINE_MAX) }, storeId: store.id, supplierProductId: { not: null }, status: { not: "archived" } },
    select: { id: true, name: true, fulfillmentType: true, deliveryPayer: true, deliveryFlatFee: true, brandingChoice: true, supplierProduct: { select: productSelect } },
  });
  const sources = rows.flatMap((row) => (row.supplierProduct && row.fulfillmentType === "dropship" ? [row.supplierProduct] : []));
  const terms = await dropshipTermsFor(sources, userId);
  const markup = change.mode === "markup" ? change.markup : DEFAULT_MARKUP;
  const updated: Array<{ id: string; price: number }> = [];
  const skipped: Array<{ id: string; name: string; message: string }> = [];
  for (const row of rows) {
    const source = row.supplierProduct;
    if (!source) {
      skipped.push({ id: row.id, name: row.name, message: "The supplier doesn't sell this any more." });
      continue;
    }
    const dropship = row.fulfillmentType === "dropship";
    const productTerms = dropship ? terms.get(source.id) : undefined;
    const cost = productTerms?.cost ?? (dropship ? dropshipUnitPrice(source) : source.wholesalePrice);
    const { price } = quickAddPrice({ cost, suggested: source.suggestedRetailPrice, minRetail: productTerms?.floor ?? source.minRetailPrice, markup, preferSuggested: change.mode === "suggested" });
    if (productTerms) {
      const problem = listingProblem(productTerms, { retailPrice: price, payer: row.deliveryPayer, flatFee: row.deliveryFlatFee, brandingChoice: row.brandingChoice });
      if (problem) {
        skipped.push({ id: row.id, name: row.name, message: problem });
        continue;
      }
    }
    await db.storeProduct.update({ where: { id: row.id }, data: { retailPrice: price, costPrice: cost, margin: price - cost } });
    updated.push({ id: row.id, price });
  }
  if (change.mode === "markup") await saveSellerMarkup(userId, change.markup);
  return { updated, skipped };
}

/** Takes these supplier products out of the shop (archived like any removed product; the dropship link ends). */
export async function removeSupplierProducts(userId: string, ids: readonly string[]) {
  const store = await storeOf(userId);
  if (!store) return null;
  const rows = await db.storeProduct.findMany({ where: { id: { in: [...new Set(ids)].slice(0, MINE_MAX) }, storeId: store.id, supplierProductId: { not: null }, status: { not: "archived" } }, select: { id: true } });
  const list = rows.map((row) => row.id);
  if (list.length) {
    await db.$transaction([
      db.storeProduct.updateMany({ where: { id: { in: list } }, data: { status: "archived" } }),
      db.dropshipRelationship.updateMany({ where: { storeProductId: { in: list } }, data: { status: "ended" } }),
    ]);
    void import("@/lib/whatsapp-catalog/dirty").then((dirty) => dirty.markCatalogDirty(store.id)).catch(() => undefined);
  }
  return { removed: list.length };
}

// ─── Rate limits ──────────────────────────────────────────────────────────────

/** Per seller, per action: adding (each call up to 60 products), undo, markup, and changing many products. */
export const QUICK_LIMITS = {
  add: { maxRequests: 40, windowMs: 10 * 60_000 },
  undo: { maxRequests: 40, windowMs: 10 * 60_000 },
  markup: { maxRequests: 20, windowMs: 10 * 60_000 },
  mine: { maxRequests: 30, windowMs: 10 * 60_000 },
} as const;

/** True when this seller made too many of these calls lately. */
export async function overQuickLimit(userId: string, action: keyof typeof QUICK_LIMITS) {
  return !(await checkRateLimitShared(rateLimitKey(`find:${action}`, userId), QUICK_LIMITS[action])).allowed;
}

// ─── Find extras and starter packs ────────────────────────────────────────────

/** The seller's state, for "Delivers to my state" (their delivery origin, else their shop's city). */
export async function sellerState(userId: string): Promise<string | null> {
  return (await sellerPlaceOf(userId).catch(() => null))?.state ?? null;
}

/** Whether a supplier in this city is in the seller's state. */
export function sameState(state: string | null, supplier: { city?: string | null; address?: string | null }) {
  if (!state) return false;
  const place = placeOf({ city: supplier.city ?? "" });
  const fromAddress = supplier.address ? placeOf({ city: supplier.address.split(",").pop() ?? "" }) : null;
  return place.state === state || fromAddress?.state === state;
}

/** The supplier products already in the shop (not removed). */
export async function inShopIds(storeId: string) {
  const rows = await db.storeProduct.findMany({ where: { storeId, supplierProductId: { not: null }, status: { not: "archived" } }, select: { supplierProductId: true } });
  return rows.map((row) => row.supplierProductId).filter((id): id is string => Boolean(id));
}

export type StarterPackView = Omit<StarterPack, "needsAgreement" | "items"> & {
  needsAgreement: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; image: string | null; category: string; supplierName: string; cost: number; price: number; ready: boolean; dropship: boolean }>;
};

/** Ready-made packs for this seller, worked out from the products near them. Null without a store. */
export async function starterPacksFor(userId: string): Promise<{ packs: StarterPackView[]; markup: Markup; asked: boolean } | null> {
  const store = await storeOf(userId);
  if (!store) return null;
  const rows = await db.supplierProduct.findMany({
    where: { status: "published", stockQuantity: { gt: 0 }, supplier: { ...VISIBLE_SUPPLIER, verificationStatus: "verified", country: { equals: store.country || "Nigeria", mode: "insensitive" } } },
    select: {
      id: true, name: true, images: true, stockQuantity: true, trendScore: true, wholesalePrice: true, suggestedRetailPrice: true, priceMode: true, dropshipPrice: true, minRetailPrice: true, dropshipAvailable: true,
      category: { select: { name: true } },
      supplier: { select: { id: true, displayName: true, city: true, address: true, rating: true, ratingCount: true, verificationStatus: true } },
    },
    orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
    take: 400,
  });
  const decorated = rows.map((row) => ({ ...row, supplier: { ...row.supplier, id: row.supplier.id as string | null } }));
  const [nearby, inShop] = await Promise.all([nearbyForSeller(userId, decorated, new Map(rows.map((row) => [row.supplier.id, row.supplier.address]))), inShopIds(store.id)]);
  const added = new Set(inShop);
  const candidates: PackCandidate[] = nearby.products.map((row) => ({
    id: row.id,
    name: row.name,
    category: shortCategory(row.category?.name),
    supplierId: row.supplier.id!,
    stock: row.stockQuantity,
    verified: row.supplier.verificationStatus === "verified",
    rating: row.supplier.ratingCount > 0 ? row.supplier.rating : null,
    ratingCount: row.supplier.ratingCount,
    trendScore: row.trendScore,
    inRange: true,
    inShop: added.has(row.id),
    dropship: row.dropshipAvailable,
    agreed: (row.supplier as { agreed?: boolean }).agreed === true,
    cost: row.dropshipAvailable ? dropshipUnitPrice(row) : row.wholesalePrice,
    suggested: row.suggestedRetailPrice,
    minRetail: row.dropshipAvailable ? retailFloor(row) : row.minRetailPrice,
  }));
  const saved = parseSourcing(settingsOf(store.brandSettings).sourcing).markup ?? null;
  const markup = saved ?? DEFAULT_MARKUP;
  const byId = new Map(nearby.products.map((row) => [row.id, row]));
  const supplierNames = new Map(nearby.products.map((row) => [row.supplier.id!, row.supplier.displayName]));
  const packs = starterPacks(candidates, markup).map((pack) => ({
    ...pack,
    needsAgreement: pack.needsAgreement.map((id) => ({ id, name: supplierNames.get(id) ?? "" })),
    items: pack.items.map((item) => {
      const row = byId.get(item.id)!;
      return { id: item.id, name: item.name, image: row.images[0] ?? null, category: item.category ?? "", supplierName: row.supplier.displayName, cost: item.cost, price: item.price, ready: item.ready, dropship: item.dropship };
    }),
  }));
  return { packs, markup, asked: Boolean(saved) };
}
