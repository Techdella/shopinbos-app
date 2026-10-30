import { NextRequest } from "next/server";
import { productLimitProblem } from "@/lib/plans/gates.server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { inShopIds, linkSupplierProduct } from "@/lib/marketplace/quick-add.server";
import { mergeBrandSettings } from "@/lib/workspace";
import { VISIBLE_SUPPLIER, listingCheck } from "@/lib/marketplace/agreements.server";
import { ListingChoiceSchema, checkDropshipListing, dropshipTermsFor, skuFields } from "@/lib/marketplace/dropship-listing.server";

export const dynamic = "force-dynamic";

// Find products in the mobile app. The product cards read /api/public/products; this route adds what only the
// signed-in seller has:
//   GET  → { country, destination, addedIds }: the store's country (which suppliers to show), where wholesale
//          quotes ship to, and the supplier products already in the store.
//   GET ?productId=<supplier product id> → the same, plus `dropship`: the dropship terms for that product (null when
//          it isn't offered for dropship), the "You pay / Your price / You earn" screen (shared/dropship-checkout.ts
//          DropshipTerms):
//            { cost, suggestedPrice, floor, minRetailPrice, options: string[], minQty, handlingDays,
//              sizeBand: "small"|"medium"|"bulky", shipsFrom, rateSource: "partners"|"own",
//              deliveryToYou: { zone, zoneLabel, price, minDays, maxDays } | null, dearestDelivery, dearestIsEstimate,
//              stock, stockState }
//          "You earn" per order: shared/dropship-checkout.ts listingEarn(terms, { retailPrice, payer, flatFee });
//          listingProblem(...) is the message the POST refuses with. Every parcel is packed plain (no branding).
//   POST { supplierProductId, retailPrice?, deliveryPayer?: "customer"|"seller"|"flat", deliveryFlatFee?,
//          sku?, barcode? } → { storeProductId, already } (an older app's brandingChoice is ignored):
//          "Add to store", the same as the web's addSupplierProductToStore action: a draft product linked to the
//          supplier (dropship when offered), never a duplicate. A dropship price below the supplier's lowest
//          allowed price, or one that would lose money, is refused: 409 { error: { code: "PRICE_PROBLEM", message } }.

/** Same floor and ceiling as the web's price stepper (src/lib/marketplace/find.ts clampSellingPrice). */
function clampSellingPrice(price: number, cost: number) {
  const fee = cost > 0 ? Math.round(Math.min(cost * 0.015 + (cost >= 2500 ? 100 : 0), 2000)) : 0;
  const floor = Math.ceil((cost + fee + 100) / 100) * 100;
  const ceiling = Math.max(floor, Math.round(cost * 10));
  return Math.min(ceiling, Math.max(floor, Math.round(price)));
}

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, city: true, country: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  // Removed (archived) products don't count as in the shop: they can be added again.
  const addedIds = await inShopIds(store.id);
  const productId = req.nextUrl.searchParams.get("productId")?.slice(0, 64) || null;
  const product = productId ? await db.supplierProduct.findFirst({ where: { id: productId, status: "published", supplier: VISIBLE_SUPPLIER } }) : null;
  const dropship = product?.dropshipAvailable ? (await dropshipTermsFor([product], user.id)).get(product.id) ?? null : null;
  return ok({
    country: store.country || "Nigeria",
    destination: [store.city, store.country].filter(Boolean).join(", ") || "Nigeria",
    addedIds,
    ...(productId ? { dropship } : {}),
  });
});

const AddSchema = ListingChoiceSchema.extend({ supplierProductId: z.string().min(1).max(64), retailPrice: z.number().positive().max(100_000_000).optional() });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "That product couldn't be added.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);

  const product = await db.supplierProduct.findFirst({
    where: { id: parsed.data.supplierProductId, status: "published", supplier: VISIBLE_SUPPLIER },
    include: { supplier: { select: { verificationStatus: true } } },
  });
  if (!product) return apiError("NOT_FOUND", "This product isn't available any more.", 404);
  const existing = await db.storeProduct.findFirst({ where: { storeId: store.id, supplierProductId: product.id, status: { not: "archived" } }, select: { id: true } });
  if (existing) return ok({ storeProductId: existing.id, already: true });

  // The same checks as the web (src/lib/marketplace/agreements.server.ts): dropship needs the agreement.
  if (product.dropshipAvailable) {
    const gate = await listingCheck(user.id, product.supplierId);
    if (!gate.ok) return apiError(gate.code, gate.message, 409);
  } else if (product.supplier.verificationStatus !== "verified") {
    return apiError("NOT_AVAILABLE", "Buy stock only from verified suppliers. This one isn't verified yet.", 409);
  }


  const dropship = product.dropshipAvailable;
  const check = dropship ? await checkDropshipListing(product, user.id, parsed.data, clampSellingPrice) : null;
  if (check && !check.ok) return apiError(check.code, check.message, 409);
  const retailPrice = check?.ok ? check.retailPrice : clampSellingPrice(parsed.data.retailPrice ?? product.suggestedRetailPrice, product.wholesalePrice);
  const costPrice = check?.ok ? check.costPrice : product.wholesalePrice;
  const planLimit = await productLimitProblem(user.id, store.id, 1, dropship);
  if (planLimit) return apiError("PLAN_LIMIT", planLimit, 402);
  // Made under the store's lock, so a second tap or another phone never adds it twice (quick-add.server.ts).
  const linked = await linkSupplierProduct({
    storeId: store.id,
    userId: user.id,
    product,
    retailPrice,
    costPrice,
    dropship,
    ...(check?.ok ? { deliveryPayer: check.deliveryPayer, deliveryFlatFee: check.deliveryFlatFee } : {}),
    ...skuFields(parsed.data),
  });
  if (linked.already) return ok({ storeProductId: linked.storeProductId, already: true });
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "product_added", ref: linked.storeProductId })).catch(() => undefined);
  await db.store.update({ where: { id: store.id }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { setup: { productAdded: true } }) } });
  return ok({ storeProductId: linked.storeProductId, already: false }, 201);
});
