// The seller's tags (Tag Manager, Meta Pixel, TikTok Pixel) told about what happens inside the store: page
// changes the store makes without a full page load, and the shop funnel (product viewed, added to bag, checkout
// started, order placed). Only for tags the shopper agreed to (src/components/storefront/StoreConsent.tsx keeps
// window.__sibTags up to date) and only once their code is on the page. No import from the app, so
// tests/store-traffic.test.mjs runs the mapping directly.
//
// Page views: Tag Manager's history-change trigger counts in-store page changes, so we never send page_view ourselves
// (it would count every page twice). The Meta and TikTok pixels don't, so they get PageView / page() on each in-store
// page change.

export type TagEventName = "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

export interface TagItem {
  id: string;
  name?: string;
  price?: number;
  quantity?: number;
}

export interface TagEventData {
  items: TagItem[];
  /** Total value; defaults to the items' price × quantity. */
  value?: number;
  currency?: string;
  /** Purchase only: the order id, sent as each platform's dedupe id. */
  orderId?: string;
}

export interface TagState {
  analytics: boolean;
  marketing: boolean;
  gtm: boolean;
  meta: boolean;
  tiktok: boolean;
  currency: string;
}

const META_NAME: Record<TagEventName, string> = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" };
const TIKTOK_NAME: Record<TagEventName, string> = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "CompletePayment" };

const money = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const qty = (value: unknown) => Math.max(1, Math.min(999, Math.floor(Number(value) || 1)));
const cleanId = (value: unknown) => String(value ?? "").replace(/[^\w.:-]/g, "").slice(0, 64);
const cleanCurrency = (value: unknown, fallback: string) => (typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : fallback);

function normalized(data: TagEventData, fallbackCurrency: string) {
  const items = (data.items ?? []).map((item) => ({ id: cleanId(item.id), name: item.name ? String(item.name).slice(0, 120) : undefined, price: money(item.price), quantity: qty(item.quantity) })).filter((item) => item.id);
  const value = data.value != null ? money(data.value) : money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  return { items, value, currency: cleanCurrency(data.currency, fallbackCurrency), orderId: data.orderId ? cleanId(data.orderId) : "" };
}

/** The standard (GA4-format) e-commerce event params Tag Manager gets as `ecommerce`. */
export function ga4Event(name: TagEventName, data: TagEventData, fallbackCurrency = "NGN"): [string, Record<string, unknown>] {
  const n = normalized(data, fallbackCurrency);
  return [
    name,
    {
      currency: n.currency,
      value: n.value,
      ...(name === "purchase" && n.orderId ? { transaction_id: n.orderId } : {}),
      items: n.items.map((item) => ({ item_id: item.id, ...(item.name ? { item_name: item.name } : {}), price: item.price, quantity: item.quantity })),
    },
  ];
}

/** Meta Pixel standard event: [event, params, options with the dedupe eventID]. */
export function metaEvent(name: TagEventName, data: TagEventData, fallbackCurrency = "NGN"): [string, Record<string, unknown>, Record<string, string>] {
  const n = normalized(data, fallbackCurrency);
  const params: Record<string, unknown> = {
    content_ids: n.items.map((item) => item.id),
    content_type: "product",
    contents: n.items.map((item) => ({ id: item.id, quantity: item.quantity, item_price: item.price })),
    value: n.value,
    currency: n.currency,
  };
  if (name === "begin_checkout" || name === "purchase") params.num_items = n.items.reduce((sum, item) => sum + item.quantity, 0);
  if (name === "view_item" && n.items[0]?.name) params.content_name = n.items[0].name;
  return [META_NAME[name], params, name === "purchase" && n.orderId ? { eventID: `order-${n.orderId}` } : {}];
}

/** TikTok Pixel standard event: [event, params, options with the dedupe event_id]. */
export function tiktokEvent(name: TagEventName, data: TagEventData, fallbackCurrency = "NGN"): [string, Record<string, unknown>, Record<string, string>] {
  const n = normalized(data, fallbackCurrency);
  return [
    TIKTOK_NAME[name],
    {
      contents: n.items.map((item) => ({ content_id: item.id, content_type: "product", quantity: item.quantity, price: item.price, ...(item.name ? { content_name: item.name } : {}) })),
      value: n.value,
      currency: n.currency,
    },
    name === "purchase" && n.orderId ? { event_id: `order-${n.orderId}` } : {},
  ];
}

// ─── In the browser ─────────────────────────────────────────────────────────────

type Fn = (...args: unknown[]) => void;
interface TagWindow {
  __sibTags?: TagState;
  dataLayer?: unknown[];
  fbq?: Fn;
  ttq?: { page?: Fn; track?: Fn };
}

function tagWindow(): TagWindow | null {
  return typeof window === "undefined" ? null : (window as unknown as TagWindow);
}

/** What has been agreed and loaded (set by StoreConsent); null outside a live store. */
export function tagState(): TagState | null {
  return tagWindow()?.__sibTags ?? null;
}

export function setTagState(state: TagState | null) {
  const w = tagWindow();
  if (w) w.__sibTags = state ?? undefined;
}

function safely(run: () => void) {
  try {
    run();
  } catch {
    // A seller's tag failing must never break the store.
  }
}

/** A page change inside the store (no full load): Meta PageView and TikTok page(), with Marketing consent only. */
export function tagPageView() {
  const w = tagWindow();
  const state = w?.__sibTags;
  if (!w || !state?.marketing) return;
  if (state.meta && w.fbq) safely(() => w.fbq!("track", "PageView"));
  if (state.tiktok && w.ttq?.page) safely(() => w.ttq!.page!());
}

/** Fired on window by StoreConsent whenever tags start loading after a choice. */
export const TAGS_READY_EVENT = "sib:tags-ready";

/**
 * A shop funnel step for the agreed tags: Tag Manager with Analytics consent, the pixels with Marketing.
 * Returns whether any tag got it.
 */
export function tagEvent(name: TagEventName, data: TagEventData): boolean {
  const w = tagWindow();
  const state = w?.__sibTags;
  if (!w || !state || !data.items?.length) return false;
  let sent = false;
  if (state.analytics) {
    const [event, params] = ga4Event(name, data, state.currency);
    if (state.gtm && Array.isArray(w.dataLayer)) safely(() => {
      w.dataLayer!.push({ ecommerce: null });
      w.dataLayer!.push({ event, ecommerce: params });
      sent = true;
    });
  }
  if (state.marketing) {
    if (state.meta && w.fbq) {
      const [event, params, options] = metaEvent(name, data, state.currency);
      safely(() => {
        w.fbq!("track", event, params, options);
        sent = true;
      });
    }
    if (state.tiktok && w.ttq?.track) {
      const [event, params, options] = tiktokEvent(name, data, state.currency);
      safely(() => {
        w.ttq!.track!(event, params, options);
        sent = true;
      });
    }
  }
  return sent;
}

/**
 * tagEvent now, or as soon as the shopper accepts on the banner if no tag could take it yet (a shopper landing
 * on a product or order page answers the banner after the page opened). Returns a cleanup for effects.
 */
export function tagEventWhenReady(name: TagEventName, data: TagEventData, onSent?: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (tagEvent(name, data)) {
    onSent?.();
    return () => {};
  }
  const retry = () => {
    if (!tagEvent(name, data)) return;
    window.removeEventListener(TAGS_READY_EVENT, retry);
    onSent?.();
  };
  window.addEventListener(TAGS_READY_EVENT, retry);
  return () => window.removeEventListener(TAGS_READY_EVENT, retry);
}
