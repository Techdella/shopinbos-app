// Browser side of abandoned-cart capture: one recovery token per store and browser, so every update lands
// on the same saved cart, and the checkout can tell the API which cart the order recovers.

import type { CartLine, CheckoutStep } from "@shared/cart-checkout";

export function cartTokenKey(storeSlug: string) {
  return `cart-token:${storeSlug}`;
}

export function readCartToken(storeSlug: string) {
  try {
    return localStorage.getItem(cartTokenKey(storeSlug)) ?? "";
  } catch {
    return "";
  }
}

export function rememberCartToken(storeSlug: string, token: string | null | undefined) {
  try {
    if (token) localStorage.setItem(cartTokenKey(storeSlug), token);
    else localStorage.removeItem(cartTokenKey(storeSlug));
  } catch {}
}

export interface CaptureCartInput {
  visitorKey: string;
  email?: string;
  phone?: string;
  name?: string;
  items: CartLine[];
  step?: CheckoutStep;
  discountCode?: string;
}

/** Saves the bag for cart reminders. Quiet on failure: a missed capture must never block shopping. */
export async function captureCart(storeSlug: string, input: CaptureCartInput) {
  if (!input.visitorKey || input.items.length === 0 || (!input.email && !input.phone)) return;
  try {
    const res = await fetch(`/api/public/store/${encodeURIComponent(storeSlug)}/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, token: readCartToken(storeSlug) || undefined }),
      keepalive: true,
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.data?.token) rememberCartToken(storeSlug, json.data.token);
  } catch {}
}
