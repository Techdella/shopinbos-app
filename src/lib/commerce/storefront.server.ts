import "server-only";
import type { Metadata } from "next";
import { resolveStorefront } from "@/lib/storefront/public-store.server";
import { db } from "@/lib/db/client";
import { storeTakesCards, storeTakesKorapay } from "@/lib/wallet/wallet.server";
import { checkoutPaymentSettings, paystackSecretReady } from "@shared/checkout-payments";
import { readCartSettings, readCheckoutSettings } from "@shared/cart-checkout";
import type { ShopperCommerce } from "@/components/storefront/shopper/types";

// What the bag, wishlist and checkout pages need beyond the public store payload: payment methods on offer,
// delivery zones with their rate names, and the seller's cart and checkout settings. Payout account numbers
// are never included. The store itself comes from resolveStorefront (live, owner preview, or not open yet).

export type CommerceContext = ShopperCommerce;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadCommerceContext(slug: string): Promise<CommerceContext> {
  const store = await db.store.findUnique({
    where: { slug },
    select: {
      id: true,
      userId: true,
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
  // Delivery partners at checkout (the seller's Delivery settings): the pages then use the server's quote for delivery.
  const deliverySettings = store ? await db.deliverySettings.findUnique({ where: { userId: store.userId }, select: { checkoutMode: true } }) : null;
  return {
    // Card needs Paystack keys and the seller's wallet (payments settle straight to the seller's bank).
    payments: checkoutPaymentSettings(store?.brandSettings, zones, paystackSecretReady(process.env.PAYSTACK_SECRET_KEY) && Boolean(store && (await storeTakesCards(store.id))), Boolean(store && (await storeTakesKorapay(store.id)))),
    zones: zones.map((zone) => ({ name: zone.name, regions: zone.regions, rates: JSON.parse(JSON.stringify(zone.rates ?? [])) })),
    flatRate: Number.isFinite(flatRate) ? flatRate : 0,
    cart: readCartSettings(store?.brandSettings),
    checkout: readCheckoutSettings(store?.checkoutConfig ?? null),
    deliveryMode: deliverySettings?.checkoutMode === "partners" ? "partners" : "zones",
  };
}

/** Tab title for a shopper page (bag, wishlist, checkout): "Your bag | Store", or the store's name when it isn't open. */
export async function shopperPageMetadata(slug: string, label: string): Promise<Metadata> {
  const view = await resolveStorefront(slug);
  if (view.access === "missing") return { title: label, robots: { index: false } };
  const name = view.access === "closed" ? view.brand.name : view.store.name;
  return { title: { absolute: view.access === "closed" ? name : `${label} | ${name}` }, robots: { index: false } };
}
