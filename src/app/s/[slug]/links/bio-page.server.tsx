import "server-only";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BioPageView } from "./BioPageView";
import { isBotUserAgent } from "@/lib/analytics/sources";
import { bioColours } from "@/lib/bio/pure";
import { loadPublicBio, recordBioView } from "@/lib/bio/service.server";
import { loadStoreBrand } from "@/lib/storefront/public-store.server";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";

// The store's link in bio page for both its addresses (/s/<slug>/links and https://<own domain>/links).

export async function bioMetadata(slug: string): Promise<Metadata> {
  const [page, brand] = await Promise.all([loadPublicBio(slug), loadStoreBrand(slug)]);
  if (!page || !brand) return { title: "Links", robots: { index: false } };
  const description = page.bio || `Shop ${brand.name}: our products, offers and how to reach us.`;
  return {
    title: { absolute: page.title },
    description,
    openGraph: { title: page.title, description, siteName: brand.name, type: "website", ...(page.avatarUrl ? { images: [{ url: page.avatarUrl, alt: page.title }] } : {}) },
    twitter: { card: "summary", title: page.title, description, ...(page.avatarUrl ? { images: [page.avatarUrl] } : {}) },
  };
}

export async function renderBioPage(slug: string) {
  const [page, brand, requestHeaders] = await Promise.all([loadPublicBio(slug), loadStoreBrand(slug), headers()]);
  if (!page || !brand) notFound();
  if (!isBotUserAgent(requestHeaders.get("user-agent"))) await recordBioView(slug);
  const theme = resolveShopperTheme(brand.brandSettings);
  const colours = bioColours(page.theme, { background: theme.paper, text: theme.ink, button: theme.cta, buttonText: theme.ctaText });
  return (
    <div className="min-h-dvh" style={{ background: colours.background }}>
      <BioPageView slug={slug} page={page} colours={colours} />
    </div>
  );
}
