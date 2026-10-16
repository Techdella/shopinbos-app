import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontClient } from "./StorefrontClient";
import { PreviewClient } from "./preview/PreviewClient";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { storeHomeMetadata } from "@/lib/seo/store-head";
import { storePageSeo } from "@/lib/seo/page-seo";
import { EMPTY_SEO, seoMetadata } from "@/lib/seo/fields";
import { resolveStorefront } from "@/lib/storefront/public-store.server";
import { StoreClosedPage } from "@/components/storefront/shopper/StoreClosedPage";
import { scriptSafeJson } from "@/lib/security/html";
import { readIntegrations, storeVerificationMetadata } from "@/lib/storefront/integrations";
import { normalizeStorefrontPageKey, STOREFRONT_PAGE_PATHS, storeHasStorefrontPage, storefrontPagePath } from "@shared/storefront-pages";

// The live storefront as a route renders it: its home (/s/[slug], /) or one of its pages (/shop, /about, a custom
// page…, through /s/[slug]/[collection]). Shared so every address of a page gets the same head and the same
// server-rendered page, with no flash of the home page first.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreData = any;

const PAGE_TITLES: Record<string, string> = { products: "Shop", categories: "Categories", about: "About", contact: "Contact", faq: "FAQ" };

function fallbackPageTitle(key: string) {
  return PAGE_TITLES[key] ?? key.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/**
 * The page key a path segment opens on this store ("about", "products" for /shop), or null when the store has no
 * such page (the route then falls back to CMS collections and 404). A store that isn't live answers its standard
 * pages too, so /about shows "not open yet" (or the owner's preview) rather than a 404.
 */
export async function liveStorefrontPageKey(slug: string, segment: string) {
  const key = normalizeStorefrontPageKey(segment);
  if (!key || key === "home") return null;
  const view = await resolveStorefront(slug);
  if (view.access === "missing") return null;
  if (view.access !== "live") return STOREFRONT_PAGE_PATHS[key] ? key : null;
  return storeHasStorefrontPage(view.store, key) ? key : null;
}

/** <head> for a store's home or one of its pages: the page's own SEO tab, canonical at its clean address. */
export async function storefrontMetadata(slug: string, pageKey = "home", customDomain?: string | null): Promise<Metadata> {
  const view = await resolveStorefront(slug);
  if (view.access === "missing") return { title: "Store not found" };
  // Not live yet: the owner's preview or the "not open yet" page, neither of which should be indexed.
  if (view.access === "closed") return { title: { absolute: view.brand.name }, robots: { index: false, follow: false } };
  if (view.access === "preview") return { title: { absolute: `Preview: ${view.store.name}` }, robots: { index: false, follow: false } };
  const store: StoreData = view.store;
  const storeRef = { slug: store.slug ?? slug, customDomain: customDomain ?? store.customDomain ?? null };

  const key = normalizeStorefrontPageKey(pageKey) ?? "home";
  const path = storefrontPagePath(key);
  if (key !== "home" && path) {
    const pageSeo = storePageSeo(store, key);
    return seoMetadata(pageSeo?.seo ?? EMPTY_SEO, {
      title: pageSeo?.title ?? fallbackPageTitle(key),
      titleSuffix: store.name,
      description: store.description ?? "",
      image: store.logoUrl,
      canonical: buildStorefrontUrl(storeRef, path),
      siteName: store.name,
    }) as Metadata;
  }

  // Canonical: the store's real address (its own domain, mybos.store subdomain or app.shopinbos.com/s/<slug>).
  // Verification tags (Search Console, Bing, Meta, Pinterest) from Settings › Connections, validated.
  return { ...storeHomeMetadata(store, buildStorefrontUrl(storeRef)), ...storeVerificationMetadata(readIntegrations(store.brandSettings)) };
}

function buildJsonLd(store: StoreData) {
  const storeUrl = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null });

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    url: storeUrl,
    logo: store.logoUrl ?? undefined,
    description: store.description ?? undefined,
    address: store.city
      ? {
          "@type": "PostalAddress",
          addressLocality: store.city,
          addressCountry: store.country ?? "NG",
        }
      : undefined,
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: store.name,
    url: storeUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${storeUrl.replace(/\/$/, "")}${storefrontPagePath("products")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products = ((store.storeProducts ?? []) as any[]).slice(0, 10).map((p: any) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? undefined,
    image: p.images[0] ?? undefined,
    offers: {
      "@type": "Offer",
      price: p.retailPrice,
      priceCurrency: p.currency ?? store.currency ?? "NGN",
      availability: "https://schema.org/InStock",
      url: `${storeUrl.replace(/\/$/, "")}/product/${p.id}`,
      seller: {
        "@type": "Organization",
        name: store.name,
      },
    },
  }));

  return [organization, website, ...products];
}

/** The storefront with `pageKey` selected (home by default). `closedPath` is where "not open yet" sends the owner back to. */
export async function StorefrontRoute({ slug, storeBasePath, pageKey = "home", closedPath }: { slug: string; storeBasePath: string; pageKey?: string; closedPath: string | null }) {
  const view = await resolveStorefront(slug);
  if (view.access === "missing") notFound();
  if (view.access === "closed") return <StoreClosedPage store={view.brand} basePath={storeBasePath} path={closedPath} />;
  // The owner of a store that isn't live sees it with their builder draft, under the preview bar.
  if (view.access === "preview") return <PreviewClient store={view.store} storeBasePath={storeBasePath} live={false} initialPage={pageKey} />;

  const store: StoreData = view.store;
  const jsonLdItems = buildJsonLd(store);

  return (
    <>
      {/* The seller's GA4 / Tag Manager / pixels load from the storefront layout on every live store page. */}
      {/* JSON-LD Structured Data (Google Merchant + rich snippets) */}
      {jsonLdItems.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: scriptSafeJson(item) }}
        />
      ))}

      <StorefrontClient store={store} storeBasePath={storeBasePath} initialPage={pageKey} syncAddress />
    </>
  );
}
