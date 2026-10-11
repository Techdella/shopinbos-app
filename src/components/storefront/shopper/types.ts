import type { ShopperProduct } from "./catalog";

/** The public store payload (/api/public/store/[slug]) as the bag, wishlist and checkout pages use it. */
export interface ShopperStore {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  currency: string;
  country?: string | null;
  brandSettings?: Record<string, unknown> | null;
  storeProducts: ShopperProduct[];
  shopper?: unknown;
}

import type { CheckoutPaymentSettings } from "@shared/checkout-payments";
import type { CartSettings, CheckoutSettings, DeliveryZoneInput } from "@shared/cart-checkout";

/** Seller settings and delivery zones the bag, wishlist and checkout pages honour (see loadCommerceContext). */
export interface ShopperCommerce {
  payments: CheckoutPaymentSettings;
  zones: DeliveryZoneInput[];
  flatRate: number;
  cart: CartSettings;
  checkout: CheckoutSettings;
}
