import "server-only";
import { db } from "@/lib/db/client";
import { checkoutPaymentSettings, paystackSecretReady } from "@shared/checkout-payments";
import { readCartSettings, readCheckoutSettings } from "@shared/cart-checkout";
import type { ShopperCommerce } from "@/components/storefront/shopper/types";

// What the bag, wishlist and checkout pages need beyond the public store payload: payment methods on offer,
// delivery zones with their rate names, and the seller's cart and checkout settings. Payout account numbers
// are never included.

export type CommerceContext = ShopperCommerce;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadCommerceContext(slug: string): Promise<CommerceContext> {
  const store = await db.store.findUnique({
    where: { slug },
    select: {
      id: true,
      brandSettings: true,
      checkoutConfig: { select: { requirePhone: true, enableNotes: true, enableGiftNote: true, enableCoupon: true, enableUpsells: true, enableTrustBadges: true, upsellProducts: true } },
    },
  });
  const zones = store
    ? await db.shippingZone.findMany({
        where: { storeId: store.id, active: true },
        orderBy: { sortOrder: "asc" },
        select: { name: true, regions: true, rates: true },
      })
    : [];
  const flatRate = Number(record(record(store?.brandSettings).shippingConfig).flatRate ?? 0);
  return {
    payments: checkoutPaymentSettings(store?.brandSettings, zones, paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)),
    zones: zones.map((zone) => ({ name: zone.name, regions: zone.regions, rates: JSON.parse(JSON.stringify(zone.rates ?? [])) })),
    flatRate: Number.isFinite(flatRate) ? flatRate : 0,
    cart: readCartSettings(store?.brandSettings),
    checkout: readCheckoutSettings(store?.checkoutConfig ?? null),
  };
}

/** The public store payload (/api/public/store/[slug]), as the storefront pages load it. */
export async function fetchPublicStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const res = await fetch(`${baseUrl}/api/public/store/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}
