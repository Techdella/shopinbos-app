import type { ReactNode } from "react";
import type { Metadata } from "next";
import { storeHeadMetadata } from "@/lib/seo/store-head";
import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { currentSlugForOldSlug } from "@/lib/store-address.server";
import { renamedStoreTarget } from "@shared/store-address";
import { LiveChatWidget } from "@/components/messaging/LiveChatWidget";
import { StoreBrandProvider } from "@/components/errors/StoreBrandContext";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadStoreBrand } from "@/lib/storefront/public-store.server";

// Every storefront page gets the store's chat box (it hides itself in the builder preview and when the
// seller hasn't turned live chat on), and the store's name and colours for its 404 and error pages.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return storeHeadMetadata(await loadStoreBrand(slug));
}

export default async function StorefrontLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [brand, requestHeaders] = await Promise.all([loadStoreBrand(slug), headers()]);
  const host = requestHeaders.get("host");
  // A store that changed its web address: the old one sends shoppers to the same page at the new address.
  if (!brand) {
    const current = await currentSlugForOldSlug(slug);
    if (current) {
      const target = renamedStoreTarget({
        host,
        path: requestHeaders.get("x-shopinbos-path") || "/",
        oldSlug: slug,
        newSlug: current,
        storeHost: getStorefrontBasePathForHost(host, slug) === "",
      });
      if (target) permanentRedirect(target);
    }
  }
  const value = brand
    ? { name: brand.name, logoUrl: brand.logoUrl, basePath: getStorefrontBasePathForHost(host, slug), theme: resolveShopperTheme(brand.brandSettings), slug: brand.slug, showBadge: brand.showBadge, paymentBadges: brand.paymentBadges }
    : null;
  return (
    <StoreBrandProvider value={value}>
      {children}
      <LiveChatWidget slug={slug} />
    </StoreBrandProvider>
  );
}
