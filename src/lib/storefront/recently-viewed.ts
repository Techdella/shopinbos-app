// Recently viewed products, remembered per store in the shopper's own browser (never sent anywhere). The product
// pages record a view (useStoreProductView); the "Recently viewed" and "You may also like" blocks read the list.
// No imports, so tests load this file with Node's type stripping.

export const RECENTLY_VIEWED_MAX = 12;
/** Fired on the window when the list changes, so blocks on the same page update. */
export const RECENTLY_VIEWED_EVENT = "shopinbos:recently-viewed";

export function recentlyViewedKey(storeSlug: string) {
  return `recently-viewed:${storeSlug}`;
}

/** Newest first, no repeats, capped; junk entries are dropped. */
export function pushRecentlyViewed(list: unknown, productId: string, max = RECENTLY_VIEWED_MAX): string[] {
  const clean = Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length < 80) : [];
  const unique = clean.filter((entry, index) => clean.indexOf(entry) === index);
  if (!productId) return unique.slice(0, max);
  return [productId, ...unique.filter((entry) => entry !== productId)].slice(0, max);
}

/** Viewed products the store still sells, in viewing order, without the one being looked at now. */
export function viewedProducts<P extends { id: string }>(ids: string[], products: P[], excludeId?: string | null) {
  const byId = new Map(products.map((product) => [product.id, product]));
  return ids.filter((id) => id !== excludeId).map((id) => byId.get(id)).filter((product): product is P => Boolean(product));
}

export function readRecentlyViewed(storeSlug: string): string[] {
  if (!storeSlug) return [];
  try {
    return pushRecentlyViewed(JSON.parse(localStorage.getItem(recentlyViewedKey(storeSlug)) ?? "[]"), "");
  } catch {
    return [];
  }
}

export function rememberRecentlyViewed(storeSlug: string, productId: string) {
  if (!storeSlug || !productId) return;
  try {
    const next = pushRecentlyViewed(readRecentlyViewed(storeSlug), productId);
    localStorage.setItem(recentlyViewedKey(storeSlug), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_EVENT, { detail: storeSlug }));
  } catch {
    // Private browsing or storage off: nothing to remember.
  }
}
