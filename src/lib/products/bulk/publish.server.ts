import "server-only";
import { db } from "@/lib/db/client";
import { productsLeft } from "@/lib/plans/gates.server";
import { productFieldsData } from "@/lib/products/save-fields.server";
import { withShortCode } from "@/lib/products/short-code.server";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { storeUrl } from "@/lib/marketing/brand";
import { supplierPlanLimits } from "@/lib/plan-limits";
import { isOnboardingComplete } from "@/lib/role-queries";
import { slugify } from "@/lib/workspace";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { notifyProductForReview } from "@/lib/notifications/events.server";
import { stockTrackingFor } from "@shared/product-stock";
import { storefrontProductUrl } from "@shared/product-codes";
import { BULK_PUBLISH_CHUNK, planPublish, summarize, type BulkEvent, type BulkItem } from "@shared/bulk-products";
import { appendEvents, newEventId, sessionItems } from "./session.server";

// "Publish N products": BULK_PUBLISH_CHUNK at a time (the client calls again until none are left, showing progress).
// Idempotent: each item's product id is saved as soon as it is made, and before making one we look for a product of
// this store (or supplier) that already has the item's first photo (every upload has its own unguessable address),
// so a retry after a dropped connection never makes a second copy. Only one publish runs per session at a time.
// Money: items keep kobo; StoreProduct and SupplierProduct keep naira, so prices are divided by 100 here.

const LOCK_MS = 2 * 60_000;

export interface PublishedProduct {
  itemId: string;
  number: number;
  productId: string;
  name: string;
  url: string | null;
  status: string;
  /** Naira, for the share message. */
  price: number;
  shortCode: string | null;
}

export interface PublishOutcome {
  published: PublishedProduct[];
  failed: Array<{ itemId: string; number: number; error: string }>;
  /** Ready products still to publish in later calls. */
  remaining: number;
  /** Ready products the plan has no room for; they stay here as drafts. */
  overLimit: number;
  limit: { max: number | null; left: number | null } | null;
  /** Products not ready yet (no name or price, or still being read). */
  notReady: number;
  busy?: boolean;
  blocked?: string;
}

async function claim(sessionId: string) {
  const claimed = await db.bulkProductSession.updateMany({
    where: { id: sessionId, OR: [{ status: "open" }, { status: "publishing", updatedAt: { lt: new Date(Date.now() - LOCK_MS) } }] },
    data: { status: "publishing" },
  });
  return claimed.count === 1;
}

async function release(sessionId: string) {
  await db.bulkProductSession.updateMany({ where: { id: sessionId, status: "publishing" }, data: { status: "open" } });
}

const describe = (item: BulkItem) => item.description.trim();

export async function publishChunk(session: { id: string; userId: string; role: string }, options: { live: boolean; only?: string[] }): Promise<PublishOutcome> {
  if (!(await claim(session.id))) return { published: [], failed: [], remaining: 0, overLimit: 0, limit: null, notReady: 0, busy: true };
  try {
    return session.role === "supplier" ? await publishSupplier(session, options) : await publishSeller(session, options);
  } finally {
    await release(session.id);
  }
}

async function finish(sessionId: string, outcome: PublishOutcome, live: boolean) {
  if (outcome.remaining > 0 || !outcome.published.length) return;
  const items = await sessionItems(sessionId);
  const summary = summarize(items);
  const event: BulkEvent = { id: newEventId(), at: new Date().toISOString(), from: "peggy", kind: "published", count: summary.published, live };
  await appendEvents(sessionId, [event]);
}

async function publishSeller(session: { id: string; userId: string }, options: { live: boolean; only?: string[] }): Promise<PublishOutcome> {
  const store = await db.store.findUnique({ where: { userId: session.userId }, select: { id: true, slug: true, customDomain: true } });
  if (!store) return { published: [], failed: [], remaining: 0, overLimit: 0, limit: null, notReady: 0, blocked: "NO_STORE" };
  const items = await sessionItems(session.id);
  const left = await productsLeft(session.userId, store.id);
  const plan = planPublish(items, left, BULK_PUBLISH_CHUNK, options.only);
  const categories = await db.category.findMany({ select: { id: true, name: true } });
  const categoryId = (name: string) => categories.find((row) => row.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null;
  const shop = storeUrl(store);
  const outcome: PublishOutcome = { published: [], failed: [], remaining: plan.remaining, overLimit: plan.overLimit, limit: left === null ? null : { max: null, left }, notReady: plan.notReady };

  for (const item of plan.batch) {
    try {
      const photo = item.photos[0];
      let product = photo ? await db.storeProduct.findFirst({ where: { storeId: store.id, images: { has: photo } }, select: { id: true, name: true, status: true, shortCode: true } }) : null;
      if (!product) {
        const colours = item.colours.filter(Boolean);
        const versions =
          colours.length > 1
            ? await productFieldsData(
                store.id,
                {
                  variantOptions: [{ name: "Colour", values: colours.map((c) => c.charAt(0).toUpperCase() + c.slice(1)) }],
                  variants: colours.map((c, index) => ({ options: { Colour: c.charAt(0).toUpperCase() + c.slice(1) }, price: null, stock: null, enabled: true, ...(colours.length === item.photos.length ? { imageUrl: item.photos[index] } : {}) })),
                },
                { inventoryType: null },
              )
            : null;
        const stock = item.stock ?? 0;
        product = await withShortCode(store.id, { name: item.name, categoryId: categoryId(item.category) }, (shortCode) =>
          db.storeProduct.create({
            data: {
              ...(versions?.ok ? (versions.data as Record<string, never>) : {}),
              storeId: store.id,
              userId: session.userId,
              name: item.name.trim().slice(0, 200),
              description: describe(item) || null,
              images: item.photos,
              retailPrice: item.priceKobo! / 100,
              currentStock: versions?.ok && typeof versions.data.currentStock === "number" ? versions.data.currentStock : stock,
              trackStock: stockTrackingFor({ currentStock: stock }),
              categoryId: categoryId(item.category),
              shortCode,
              sourceType: "seller",
              status: options.live ? "published" : "draft",
              visibility: options.live ? "storefront" : "hidden",
            },
            select: { id: true, name: true, status: true, shortCode: true },
          }),
        );
        void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: session.userId, kind: "product_added", ref: product!.id })).catch(() => undefined);
      }
      await db.bulkProductItem.update({ where: { id: item.id }, data: { productId: product.id, publishError: null } });
      outcome.published.push({ itemId: item.id, number: item.number, productId: product.id, name: product.name, status: product.status, price: item.priceKobo! / 100, shortCode: product.shortCode, url: product.status === "published" ? storefrontProductUrl(shop, product.id) : null });
    } catch (error) {
      console.error("[bulk] publish failed", item.id, error);
      const message = "We couldn't add this one. Try again.";
      await db.bulkProductItem.update({ where: { id: item.id }, data: { publishError: message } }).catch(() => undefined);
      outcome.failed.push({ itemId: item.id, number: item.number, error: message });
    }
  }
  if (outcome.published.length) await markCatalogDirty(store.id);
  await finish(session.id, outcome, options.live);
  return outcome;
}

async function publishSupplier(session: { id: string; userId: string }, options: { live: boolean; only?: string[] }): Promise<PublishOutcome> {
  const supplier = await db.supplier.findUnique({ where: { userId: session.userId } });
  if (!supplier) return { published: [], failed: [], remaining: 0, overLimit: 0, limit: null, notReady: 0, blocked: "NO_SUPPLIER" };
  if (!isOnboardingComplete(supplier)) return { published: [], failed: [], remaining: 0, overLimit: 0, limit: null, notReady: 0, blocked: "ONBOARDING_REQUIRED" };
  const items = await sessionItems(session.id);
  const [dbUser, count, categories] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId }, select: { aiCredits: true } }),
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true } }),
  ]);
  const max = supplierPlanLimits(dbUser ?? {}).listings;
  const left = max === null ? null : Math.max(0, max - count);
  const plan = planPublish(items, left, BULK_PUBLISH_CHUNK, options.only);
  // A supplier product needs a category: the one Peggy or the supplier named, else "Other", else the first.
  const fallback = categories.find((row) => /^other/i.test(row.name)) ?? categories[0];
  const categoryFor = (name: string) => categories.find((row) => row.name.toLowerCase() === name.trim().toLowerCase()) ?? fallback;
  const verified = supplier.verificationStatus === "verified";
  const outcome: PublishOutcome = { published: [], failed: [], remaining: plan.remaining, overLimit: plan.overLimit, limit: max === null ? null : { max, left }, notReady: plan.notReady };

  for (const item of plan.batch) {
    try {
      const photo = item.photos[0];
      let product = photo ? await db.supplierProduct.findFirst({ where: { supplierId: supplier.id, images: { has: photo } }, select: { id: true, name: true, status: true, slug: true } }) : null;
      if (!product) {
        const category = categoryFor(item.category);
        if (!category) throw new Error("no categories");
        const naira = item.priceKobo! / 100;
        let description = describe(item) || item.name.trim();
        if (description.length < 10) description = `${description} (${category.name})`.padEnd(10, ".");
        const slug = `${slugify(item.name) || "product"}-${supplier.id.slice(0, 6)}-${item.id.slice(-6)}`;
        product = await db.supplierProduct.create({
          data: {
            supplierId: supplier.id,
            name: item.name.trim().slice(0, 200),
            slug,
            description: description.slice(0, 5000),
            categoryId: category.id,
            images: item.photos.slice(0, 10),
            wholesalePrice: naira,
            // The supplier gave one price; shops see it as the suggested price too until the supplier changes it.
            suggestedRetailPrice: naira,
            stockQuantity: item.stock ?? 0,
            deliveryRegions: [],
            ...(supplier.buyModes.length ? { dropshipAvailable: supplier.buyModes.includes("dropship") } : {}),
            ...(supplier.minimumOrder && supplier.buyModes.includes("wholesale") ? { moq: supplier.minimumOrder } : {}),
            // Shown to shops only after an admin approves it; unverified suppliers build drafts (as the product form).
            status: options.live && verified ? "pending_review" : "draft",
          },
          select: { id: true, name: true, status: true, slug: true },
        });
        invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: supplier.slug, categorySlug: category.slug });
        if (product.status === "pending_review") await notifyProductForReview(product.id, product.name, supplier.displayName).catch(() => undefined);
        void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: session.userId, kind: "product_added", ref: product!.id })).catch(() => undefined);
      }
      await db.bulkProductItem.update({ where: { id: item.id }, data: { productId: product.id, publishError: null } });
      outcome.published.push({ itemId: item.id, number: item.number, productId: product.id, name: product.name, status: product.status, price: item.priceKobo! / 100, shortCode: null, url: null });
    } catch (error) {
      console.error("[bulk] supplier publish failed", item.id, error);
      const message = "We couldn't add this one. Try again.";
      await db.bulkProductItem.update({ where: { id: item.id }, data: { publishError: message } }).catch(() => undefined);
      outcome.failed.push({ itemId: item.id, number: item.number, error: message });
    }
  }
  await finish(session.id, outcome, options.live);
  return outcome;
}
