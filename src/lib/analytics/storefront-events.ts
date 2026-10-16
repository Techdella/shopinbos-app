"use client";

import { useEffect } from "react";
import { readOrderChannel } from "@/hooks/useCampaignAttribution";
import { rememberRecentlyViewed } from "@/lib/storefront/recently-viewed";
import { tagEvent, tagEventWhenReady, type TagEventData, type TagEventName } from "@/lib/storefront/tag-events";

// Storefront funnel beacons for /home/analytics: product views, add to bag and checkout started.
// Counts only, deduplicated per browser session so a refresh doesn't double count.
//
// The same steps go to the seller's own tags (GA4 / Tag Manager: view_item, add_to_cart, begin_checkout, purchase;
// Meta: ViewContent, AddToCart, InitiateCheckout, Purchase; TikTok: ViewContent, AddToCart, InitiateCheckout,
// CompletePayment) with value, currency and product ids, only for the tags the shopper agreed to on the cookie
// banner (src/lib/storefront/tag-events.ts). The order page sends the purchase once per order.

type StoreEvent = "product_view" | "add_to_cart" | "checkout_start";

const TAG_NAME: Record<StoreEvent, TagEventName> = { product_view: "view_item", add_to_cart: "add_to_cart", checkout_start: "begin_checkout" };

function once(key: string) {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    // Without sessionStorage we may count twice; harmless.
  }
  return true;
}

/**
 * Counts one funnel step and tells the agreed tags. Returns a cleanup: a product view or checkout opened before the
 * shopper answered the banner waits for the answer while that page is open, and is dropped when they move on.
 */
export function trackStoreEvent(storeSlug: string, type: StoreEvent, productId?: string, tags?: TagEventData): () => void {
  let cleanup = () => {};
  if (!storeSlug || typeof window === "undefined") return cleanup;
  if (tags) {
    if (type === "add_to_cart") tagEvent(TAG_NAME[type], tags);
    else cleanup = tagEventWhenReady(TAG_NAME[type], tags);
  }
  if (type !== "add_to_cart" && !once(`sib-evt:${storeSlug}:${type}:${productId ?? ""}`)) return cleanup;
  void fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...(productId ? { productId } : {}), ref: readOrderChannel(storeSlug) ?? undefined }),
    keepalive: true,
  }).catch(() => null);
  return cleanup;
}

/** What the tags get about a product: its id, name and price. */
export interface TaggedProduct {
  id: string;
  name?: string;
  price?: number;
  currency?: string;
}

/** Counts one product view per product per session, and remembers it on this device for "Recently viewed". */
export function useStoreProductView(storeSlug: string, productId: string | null | undefined, product?: TaggedProduct) {
  const name = product?.name;
  const price = product?.price;
  const currency = product?.currency;
  useEffect(() => {
    if (!storeSlug || !productId) return;
    const cleanup = trackStoreEvent(storeSlug, "product_view", productId, { items: [{ id: productId, name, price, quantity: 1 }], value: price, currency });
    rememberRecentlyViewed(storeSlug, productId);
    return cleanup;
  }, [storeSlug, productId, name, price, currency]);
}

/** Counts one "started checkout" per session; the tags get the bag (once it has loaded). */
export function useStoreCheckoutStart(storeSlug: string, bag?: { items: Array<{ productId: string; name?: string; price: number; quantity: number }>; loaded: boolean; currency?: string }) {
  const ready = Boolean(bag?.loaded);
  const items = bag?.items;
  const currency = bag?.currency;
  useEffect(() => {
    if (!storeSlug || (bag && !ready)) return;
    const lines = (items ?? []).map((item) => ({ id: item.productId, name: item.name, price: item.price, quantity: item.quantity }));
    return trackStoreEvent(storeSlug, "checkout_start", undefined, lines.length ? { items: lines, currency } : undefined);
    // Once per checkout page visit: the bag changing on the page is not a new checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSlug, ready]);
}

/**
 * The order page: Purchase / CompletePayment / purchase for the seller's tags, once per order on this device (a
 * revisit, a refresh or the link in the confirmation email never sends it again). Paid orders, and pay-on-delivery
 * orders as soon as they are placed. Counting orders for /home/analytics happens on the server, not here.
 */
export function useStorePurchase(storeSlug: string, order: { id: string; total: number; currency: string; items: Array<{ productId?: string; name?: string; price: number; quantity: number }> } | null) {
  const orderId = order?.id;
  useEffect(() => {
    if (!storeSlug || !order || !orderId) return;
    const key = `sib-tag-purchase:${storeSlug}:${orderId}`;
    const sent = () => {
      try {
        localStorage.setItem(key, "1");
      } catch {
        try {
          sessionStorage.setItem(key, "1");
        } catch {}
      }
    };
    try {
      if (localStorage.getItem(key) || sessionStorage.getItem(key)) return;
    } catch {}
    const items = order.items.filter((item) => item.productId).map((item) => ({ id: item.productId!, name: item.name, price: item.price, quantity: item.quantity }));
    if (!items.length) return;
    return tagEventWhenReady("purchase", { items, value: order.total, currency: order.currency, orderId }, sent);
    // The order is fixed for the page; only its id matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSlug, orderId]);
}

/** ?ref= / ?utm_source= and ?utm_campaign= on the landing URL, for the visit beacon. */
export function landingSource() {
  try {
    const params = new URLSearchParams(window.location.search);
    return { ref: params.get("ref") ?? params.get("utm_source") ?? undefined, campaign: params.get("utm_campaign") ?? undefined };
  } catch {
    return {};
  }
}
