"use client";

import { createContext, useContext } from "react";
import type React from "react";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import type { PaymentBadgeKey } from "@shared/payment-badges";

// The storefront layouts put the store's name, logo, link and colours here, so the storefront 404 and error
// pages (which get no params) can dress in the shop's own theme. Null for a slug no store uses.
//
// It also carries the footer badges (StoreFooterBadges): whether to show "Built with Shopinbos" and the store's
// payment logos. The builder's canvas sits outside the storefront layouts, so it never shows them.

export interface StoreBrandValue {
  name: string;
  logoUrl: string | null;
  basePath: string;
  theme: ShopperTheme;
  slug?: string;
  /** "Built with Shopinbos" in the footer (every store unless a paid seller turned it off). */
  showBadge?: boolean;
  /** The payment logos the seller chose (or the defaults from their payment methods). */
  paymentBadges?: PaymentBadgeKey[];
  /** The store shows the cookie banner, so its footers offer "Cookie settings" to open it again. */
  cookieSettings?: boolean;
}

const StoreBrandContext = createContext<StoreBrandValue | null>(null);

export function StoreBrandProvider({ value, children }: { value: StoreBrandValue | null; children: React.ReactNode }) {
  return <StoreBrandContext.Provider value={value}>{children}</StoreBrandContext.Provider>;
}

export function useStoreBrand() {
  return useContext(StoreBrandContext);
}
