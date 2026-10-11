import "server-only";

import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { appOrigin } from "@/lib/ads";
import { buildFeedItems, metaBatchRequests, type FeedBuild, type FeedChannel } from "./feeds";

// Server side of social selling: catalog feeds, the store's channel connections, and the feed URLs sellers paste.

export const FEED_PRODUCT_LIMIT = 5000;

export function feedUrl(slug: string, file: string) {
  return `${appOrigin()}/api/public/feeds/${encodeURIComponent(slug)}/${file}`;
}

export function productLink(store: { slug: string; customDomain: string | null }, productId: string) {
  return buildStorefrontUrl(store, `/product/${productId}`);
}

export async function loadFeedProducts(storeId: string) {
  const products = await db.storeProduct.findMany({
    where: { storeId, status: "published" },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    take: FEED_PRODUCT_LIMIT,
    select: {
      id: true,
      name: true,
      description: true,
      images: true,
      retailPrice: true,
      compareAtPrice: true,
      currency: true,
      currentStock: true,
      sku: true,
      barcode: true,
      status: true,
      category: { select: { name: true } },
    },
  });
  return products.map(({ category, ...product }) => ({ ...product, categoryName: category?.name ?? null }));
}

export async function buildStoreFeed(store: { id: string; name: string; slug: string; customDomain: string | null }, channel: FeedChannel): Promise<FeedBuild> {
  const products = await loadFeedProducts(store.id);
  return buildFeedItems(products, { channel, brand: store.name, productUrl: (id) => productLink(store, id), appOrigin: appOrigin() });
}

/** Feed problems for the /channels screen: drafts aren't listed there, only published products the feed leaves out. */
export async function feedHealth(store: { id: string; name: string; slug: string; customDomain: string | null }) {
  const [build, drafts] = await Promise.all([
    buildStoreFeed(store, "google"),
    db.storeProduct.count({ where: { storeId: store.id, status: { not: "published" } } }),
  ]);
  return { listed: build.items.length, outOfStock: build.items.filter((item) => !item.inStock).length, skipped: build.skipped, drafts };
}

export async function getConnections(storeId: string) {
  try {
    return await db.socialChannelConnection.findMany({
      where: { storeId },
      select: {
        channel: true,
        externalId: true,
        tokenEnc: true,
        feedAddedAt: true,
        lastFetchAt: true,
        lastFetchAgent: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncMessage: true,
      },
    });
  } catch (error) {
    // Table not migrated yet: feeds still work; nothing is remembered.
    console.error("[social] connections unavailable", error);
    return null;
  }
}

/** Remembers that a channel's crawler downloaded the feed (best effort). */
export async function noteFeedFetch(storeId: string, channel: FeedChannel, userAgent: string) {
  const data = { lastFetchAt: new Date(), lastFetchAgent: userAgent.slice(0, 200) };
  await db.socialChannelConnection
    .upsert({ where: { storeId_channel: { storeId, channel } }, create: { storeId, channel, ...data }, update: data })
    .catch((error) => console.error("[social] fetch note failed", error));
}

// ─── Meta catalog API sync (Facebook, Instagram and WhatsApp catalogs are all Meta catalogs) ─────────────────

const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}`;
const BATCH_SIZE = 1000;

async function graph(path: string, token: string, init?: { method: "POST"; body: Record<string, unknown> }) {
  const url = new URL(`${GRAPH}/${path}`);
  let response: Response;
  if (init) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(init.body)) form.set(key, typeof value === "string" ? value : JSON.stringify(value));
    form.set("access_token", token);
    response = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  } else {
    url.searchParams.set("access_token", token);
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  }
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !json || json.error) {
    const message = (json?.error as { message?: string } | undefined)?.message ?? `Meta answered ${response.status}`;
    throw new Error(message);
  }
  return json;
}

/** Checks a catalog ID and token can see the catalog; returns its name. */
export async function verifyMetaCatalog(catalogId: string, token: string) {
  const json = await graph(`${encodeURIComponent(catalogId)}?fields=id,name`, token);
  return typeof json.name === "string" ? json.name : catalogId;
}

/** Sends every listable product to the catalog with items_batch (upsert). Meta applies them within minutes. */
export async function pushMetaCatalog(
  store: { id: string; name: string; slug: string; customDomain: string | null },
  channel: "meta" | "whatsapp",
  catalogId: string,
  token: string,
) {
  const build = await buildStoreFeed(store, channel);
  const requests = metaBatchRequests(build);
  let handles = 0;
  for (let index = 0; index < requests.length; index += BATCH_SIZE) {
    const json = await graph(`${encodeURIComponent(catalogId)}/items_batch`, token, {
      method: "POST",
      body: { item_type: "PRODUCT_ITEM", allow_upsert: "true", requests: requests.slice(index, index + BATCH_SIZE) },
    });
    handles += Array.isArray(json.handles) ? json.handles.length : 0;
  }
  return { sent: requests.length, skipped: build.skipped.length, batches: handles };
}
