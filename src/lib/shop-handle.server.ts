import "server-only";

import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { atHandle, handleCandidates, handleProblem, normaliseHandle, shopShortLink, withNumber, type HandleProblem } from "@shared/shop-handle";

// A shop's @handle and short link (rules: shared/shop-handle.ts). Every shop gets one lazily the first time its link
// is shown (from its web address, then its name, with a number on the end when taken); the owner can change it
// (validated, unique, a few changes an hour, see /api/app/store/handle). The short link app.shopinbos.com/@handle
// is served by src/app/h/[handle]/route.ts through shopLinkTarget below.

/** Where the app lives, without a trailing slash (the short link's host). */
export function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com").replace(/\/+$/, "");
}

function isUniqueClash(error: unknown) {
  return (error as { code?: string } | null)?.code === "P2002";
}

async function handleTaken(handle: string, exceptStoreId?: string) {
  const row = await db.store.findFirst({ where: { handle, ...(exceptStoreId ? { NOT: { id: exceptStoreId } } : {}) }, select: { id: true } });
  return Boolean(row);
}

/**
 * The store's handle, giving it one first when it has none. Safe when two requests race: only a store whose handle
 * is still empty is written, and a handle another shop took meanwhile (unique index) just moves on to the next try.
 * Null only when the store doesn't exist.
 */
export async function getOrAssignShopHandle(storeId: string): Promise<string | null> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, handle: true, slug: true, name: true } });
  if (!store) return null;
  if (store.handle) return store.handle;

  const candidates = handleCandidates([store.slug, store.name]);
  // Nothing usable in the address or name ("123", emoji): "shop" + a number.
  if (!candidates.length) candidates.push(...Array.from({ length: 20 }, (_, i) => withNumber("shop", i + 2)));
  // Then random numbers, so a very common name still gets a handle.
  const base = candidates[0];
  for (let i = 0; i < 5; i++) candidates.push(withNumber(base, 100 + Math.floor(Math.random() * 99_900)));

  for (const handle of candidates) {
    if (await handleTaken(handle, store.id)) continue;
    try {
      const written = await db.store.updateMany({ where: { id: store.id, handle: null }, data: { handle } });
      if (written.count === 1) return handle;
      // Another request gave it one first.
      const now = await db.store.findUnique({ where: { id: store.id }, select: { handle: true } });
      if (now?.handle) return now.handle;
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
    }
  }
  return null;
}

export type HandleChangeResult = { ok: true; handle: string; changed: boolean } | { ok: false; problem: HandleProblem | "taken" | "notFound" };

/** Gives the store a new handle the owner typed ("@KemiBags" → "kemibags"), or says why it can't. */
export async function changeShopHandle(storeId: string, requested: string): Promise<HandleChangeResult> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, handle: true } });
  if (!store) return { ok: false, problem: "notFound" };
  const handle = normaliseHandle(requested);
  if (handle === store.handle) return { ok: true, handle, changed: false };
  const problem = handleProblem(handle);
  if (problem) return { ok: false, problem };
  if (await handleTaken(handle, store.id)) return { ok: false, problem: "taken" };
  try {
    await db.store.update({ where: { id: store.id }, data: { handle } });
  } catch (error) {
    if (isUniqueClash(error)) return { ok: false, problem: "taken" };
    throw error;
  }
  return { ok: true, handle, changed: true };
}

/** The shop behind a handle (any case, with or without "@"), or null. */
export async function findStoreByHandle(raw: string) {
  const handle = normaliseHandle(raw);
  if (handleProblem(handle)) return null;
  return db.store.findUnique({ where: { handle }, select: { id: true, slug: true, customDomain: true, handle: true, status: true } });
}

/**
 * THE one place that decides where a shop's short link (or its QR code) goes. Today: the shop's website.
 *
 * When Plug (the customer app) ships, this is where it changes, behind the pilot switch (PLUG_LIVE in
 * shared/shop-handle.ts): a phone with Plug installed opens it through an Android App Link / iOS universal link
 * on this same URL (no redirect needed); without Plug, Android goes to the Play Store listing with the handle in
 * the install referrer (https://play.google.com/store/apps/details?id=<plug id>&referrer=handle%3D<handle>) so Plug
 * follows the shop on first open, and everything else (iPhone until Plug is on the App Store, computers) keeps
 * opening the shop's website.
 */
export function shopLinkTarget(store: { slug: string; customDomain: string | null; handle: string | null }, _request: { userAgent: string | null }) {
  return buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain });
}

/** Everything the share card needs, assigning the handle first when the shop has none. */
export async function shopLinkFor(store: { id: string; name: string; slug: string; customDomain: string | null; logoUrl: string | null }) {
  const handle = await getOrAssignShopHandle(store.id);
  const storeUrl = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain });
  const shortUrl = handle ? shopShortLink(handle, appOrigin()) : storeUrl;
  return {
    handle,
    at: handle ? atHandle(handle) : null,
    shortUrl,
    shortHost: shortUrl.replace(/^https?:\/\//, ""),
    storeUrl,
    storeName: store.name,
    logoUrl: store.logoUrl,
  };
}

export type ShopLink = Awaited<ReturnType<typeof shopLinkFor>>;
