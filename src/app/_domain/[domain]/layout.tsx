import type { ReactNode } from "react";
import type { Metadata } from "next";
import { storeHeadMetadata } from "@/lib/seo/store-head";
import { headers } from "next/headers";
import { LiveChatWidget } from "@/components/messaging/LiveChatWidget";
import { StoreBrandProvider } from "@/components/errors/StoreBrandContext";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadStoreBrand } from "@/lib/storefront/public-store.server";

// The store's chat box on custom-domain storefronts, and its name and colours for the 404 and error pages.
export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }): Promise<Metadata> {
  const { domain } = await params;
  const store = await getStoreByCustomDomain(domain).catch(() => null);
  return storeHeadMetadata(store ? await loadStoreBrand(store.slug) : null);
}

export default async function CustomDomainLayout({ children, params }: { children: ReactNode; params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByCustomDomain(domain).catch(() => null);
  const brand = store ? await loadStoreBrand(store.slug) : null;
  const value = store && brand
    ? { name: brand.name, logoUrl: brand.logoUrl, basePath: getStorefrontBasePathForHost((await headers()).get("host"), store.slug), theme: resolveShopperTheme(brand.brandSettings), slug: brand.slug, showBadge: brand.showBadge, paymentBadges: brand.paymentBadges }
    : null;
  return (
    <StoreBrandProvider value={value}>
      {children}
      {store ? <LiveChatWidget slug={store.slug} /> : null}
    </StoreBrandProvider>
  );
}
