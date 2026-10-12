import type { ReactNode } from "react";
import { headers } from "next/headers";
import { LiveChatWidget } from "@/components/messaging/LiveChatWidget";
import { StoreBrandProvider } from "@/components/errors/StoreBrandContext";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadStoreBrand } from "@/lib/storefront/public-store.server";

// The store's chat box on custom-domain storefronts, and its name and colours for the 404 and error pages.
export default async function CustomDomainLayout({ children, params }: { children: ReactNode; params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByCustomDomain(domain).catch(() => null);
  const brand = store ? await loadStoreBrand(store.slug) : null;
  const value = store && brand
    ? { name: brand.name, logoUrl: brand.logoUrl, basePath: getStorefrontBasePathForHost((await headers()).get("host"), store.slug), theme: resolveShopperTheme(brand.brandSettings) }
    : null;
  return (
    <StoreBrandProvider value={value}>
      {children}
      {store ? <LiveChatWidget slug={store.slug} /> : null}
    </StoreBrandProvider>
  );
}
