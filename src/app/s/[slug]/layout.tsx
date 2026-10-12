import type { ReactNode } from "react";
import { headers } from "next/headers";
import { LiveChatWidget } from "@/components/messaging/LiveChatWidget";
import { StoreBrandProvider } from "@/components/errors/StoreBrandContext";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadStoreBrand } from "@/lib/storefront/public-store.server";

// Every storefront page gets the store's chat box (it hides itself in the builder preview and when the
// seller hasn't turned live chat on), and the store's name and colours for its 404 and error pages.
export default async function StorefrontLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [brand, host] = await Promise.all([loadStoreBrand(slug), headers().then((h) => h.get("host"))]);
  const value = brand
    ? { name: brand.name, logoUrl: brand.logoUrl, basePath: getStorefrontBasePathForHost(host, slug), theme: resolveShopperTheme(brand.brandSettings) }
    : null;
  return (
    <StoreBrandProvider value={value}>
      {children}
      <LiveChatWidget slug={slug} />
    </StoreBrandProvider>
  );
}
