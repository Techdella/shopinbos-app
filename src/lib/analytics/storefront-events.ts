"use client";

import { useEffect } from "react";
import { readOrderChannel } from "@/hooks/useCampaignAttribution";
import { rememberRecentlyViewed } from "@/lib/storefront/recently-viewed";

// Storefront funnel beacons for /home/analytics: product views, add to bag and checkout started.
// Counts only, deduplicated per browser session so a refresh doesn't double count. First-party only: stores load
// no outside tracking tags.

type StoreEvent = "product_view" | "add_to_cart" | "checkout_start";

function once(key: string) {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    // Without sessionStorage we may count twice; harmless.
  }
  return true;
}

/** Counts one funnel step. */
export function trackStoreEvent(storeSlug: string, type: StoreEvent, productId?: string) {
  if (!storeSlug || typeof window === "undefined") return;
  if (type !== "add_to_cart" && !once(`sib-evt:${storeSlug}:${type}:${productId ?? ""}`)) return;
  void fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...(productId ? { productId } : {}), ref: readOrderChannel(storeSlug) ?? undefined }),
    keepalive: true,
  }).catch(() => null);
}

/** Counts one product view per product per session, and remembers it on this device for "Recently viewed". */
export function useStoreProductView(storeSlug: string, productId: string | null | undefined) {
  useEffect(() => {
    if (!storeSlug || !productId) return;
    trackStoreEvent(storeSlug, "product_view", productId);
    rememberRecentlyViewed(storeSlug, productId);
  }, [storeSlug, productId]);
}

/** Counts one "started checkout" per session. */
export function useStoreCheckoutStart(storeSlug: string) {
  useEffect(() => {
    if (storeSlug) trackStoreEvent(storeSlug, "checkout_start");
  }, [storeSlug]);
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
