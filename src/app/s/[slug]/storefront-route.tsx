import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { StorefrontClient } from "./StorefrontClient";
import { PreviewClient } from "./preview/PreviewClient";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { storeHomeMetadata, storeVerificationMeta } from "@/lib/seo/store-head";
import { storePageSeo } from "@/lib/seo/page-seo";
import { EMPTY_SEO, seoMetadata } from "@/lib/seo/fields";
import { hasVariantQuery, NOINDEX_NOFOLLOW, storePageRobots } from "@/lib/seo/indexing";
import { storeOrganizationJsonLd, storeSearchState } from "@/lib/seo/store-seo.server";
import { breadcrumbLd, faqPageLd, itemListLd, webPageLd, websiteLd, type JsonLd } from "@/lib/seo/structured-data";
import { pageFaqs, pageSchemaType, storefrontContentPage, type ContentPage } from "@/lib/seo/storefront-content";
import { resolveStorefront } from "@/lib/storefront/public-store.server";
import { readShopperInfo } from "@/lib/storefront/shopper-info";
import { StoreClosedPage } from "@/components/storefront/shopper/StoreClosedPage";
import { gaMeasurementId, scriptSafeJson } from "@/lib/security/html";
import { normalizeStorefrontPageKey, STOREFRONT_PAGE_PATHS, storeHasStorefrontPage, storefrontPagePath } from "@shared/storefront-pages";

// The live storefront as a route renders it: its home (/s/[slug], /) or one of its pages (/shop, /about, a custom
// page…, through /s/[slug]/[collection]). Shared so every address of a page gets the same head and the same
// server-rendered page, with no flash of the home page first.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreData = any;
type SearchParams = Record<string, string | string[] | undefined>;

function getIntegrations(brandSettings?: Record<string, unknown>) {
  const integrations = brandSettings?.integrations;
  if (!integrations || typeof integrations !== "object") return {};
  const i = integrations as Record<string, unknown>;
  return {
    // Written into an inline script below, so only a well-formed GA4 ID is used.
    googleAnalyticsId: gaMeasurementId(i.googleAnalyticsId),
  };
}

const PAGE_TITLES: Record<string, string> = { products: "Shop", categories: "Categories", about: "About", contact: "Contact", faq: "FAQ" };

function fallbackPageTitle(key: string) {
  return PAGE_TITLES[key] ?? key.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** The first words a page shows (a section's heading text), for a description when the seller wrote none. */
function pageLede(page: ContentPage | null) {
  for (const section of page?.sections ?? []) {
    if (!section.visible) continue;
    for (const key of ["body", "subtitle", "text", "description"]) {
      const value = section.copy[key];
      if (typeof value === "string" && value.trim().length >= 40) return value.replace(/\s+/g, " ").trim().slice(0, 300);
    }
  }
  return "";
}

function pageDescription(store: StoreData, key: string, title: string) {
  const lede = pageLede(storefrontContentPage(store, key));
  if (lede) return lede;
  const about = typeof store.description === "string" ? store.description.trim() : "";
  if (key === "products") return `Shop ${store.storeProducts?.length ? `${store.storeProducts.length} products` : "everything"} from ${store.name}${about ? `. ${about}` : ""}`.slice(0, 300);
  if (key === "contact") return `Contact ${store.name}: questions about orders, delivery and products.${about ? ` ${about}` : ""}`.slice(0, 300);
  return about || `${title} at ${store.name}`;
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

/**
 * <head> for a store's home or one of its pages: the page's own SEO tab, canonical at its clean address (the
 * store's own domain first), indexed only while the store is live and not hidden. A search, filter or sort in the
 * address (`searchParams`) keeps that copy out of the index; its canonical is the plain page.
 */
export async function storefrontMetadata(slug: string, pageKey = "home", customDomain?: string | null, searchParams?: SearchParams): Promise<Metadata> {
  const view = await resolveStorefront(slug);
  if (view.access === "missing") return { title: "Store not found", robots: NOINDEX_NOFOLLOW };
  // Not live yet: the owner's preview or the "not open yet" page, neither of which should be indexed.
  if (view.access === "closed") return { title: { absolute: view.brand.name }, robots: NOINDEX_NOFOLLOW };
  if (view.access === "preview") return { title: { absolute: `Preview: ${view.store.name}` }, robots: NOINDEX_NOFOLLOW };
  const store: StoreData = view.store;
  const storeRef = { slug: store.slug ?? slug, customDomain: customDomain ?? store.customDomain ?? null };
  const indexable = Boolean((await storeSearchState(slug))?.indexable);
  const variant = hasVariantQuery(searchParams);

  const key = normalizeStorefrontPageKey(pageKey) ?? "home";
  const path = storefrontPagePath(key);
  if (key !== "home" && path) {
    const pageSeo = storePageSeo(store, key);
    const title = pageSeo?.title ?? fallbackPageTitle(key);
    const meta = seoMetadata(pageSeo?.seo ?? EMPTY_SEO, {
      title,
      titleSuffix: store.name,
      description: pageDescription(store, key, title),
      image: key === "products" ? (store.storeProducts?.[0]?.images?.[0] ?? store.logoUrl) : store.logoUrl,
      canonical: buildStorefrontUrl(storeRef, path),
      siteName: store.name,
    }) as Metadata;
    return { ...meta, robots: storePageRobots({ indexable, pageNoIndex: pageSeo?.seo.noIndex, variant }) };
  }

  // Canonical: the store's real address (its own domain, mybos.store subdomain or app.shopinbos.com/s/<slug>).
  return { ...storeHomeMetadata(store, buildStorefrontUrl(storeRef)), ...storeVerificationMeta(store.brandSettings?.integrations), robots: storePageRobots({ indexable, variant }) };
}

/**
 * JSON-LD for a storefront page, describing only what the page shows: the store (OnlineStore + WebSite with search)
 * and its products on the home page; the product list on the shop; AboutPage / ContactPage / WebPage elsewhere; a
 * breadcrumb trail below home; FAQPage from the page's visible FAQ sections.
 */
async function storefrontJsonLd(store: StoreData, slug: string, pageKey: string): Promise<JsonLd[]> {
  const ref = { slug: store.slug ?? slug, customDomain: store.customDomain ?? null };
  const home = buildStorefrontUrl(ref);
  const key = normalizeStorefrontPageKey(pageKey) ?? "home";
  const path = storefrontPagePath(key) ?? "/";
  const url = buildStorefrontUrl(ref, path);
  const shopUrl = buildStorefrontUrl(ref, storefrontPagePath("products") ?? "/shop");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products = ((store.storeProducts ?? []) as any[]).map((product) => ({ url: buildStorefrontUrl(ref, `/product/${encodeURIComponent(product.id)}`), name: product.name, image: product.images?.[0] ?? null }));
  const page = storefrontContentPage(store, key);
  const faq = faqPageLd(pageFaqs(page, readShopperInfo(store.shopper), store.currency ?? "NGN"), url);
  const out: Array<JsonLd | null> = [];

  if (key === "home") {
    out.push(await storeOrganizationJsonLd(slug));
    out.push(websiteLd({ name: store.name, url: home, searchUrl: shopUrl, description: store.description }));
    out.push(itemListLd({ name: `${store.name} products`, url: home, items: products.slice(0, 24) }));
    out.push(faq);
    return out.filter((entry): entry is JsonLd => Boolean(entry));
  }

  const title = storePageSeo(store, key)?.title ?? fallbackPageTitle(key);
  out.push(breadcrumbLd([{ name: store.name, url: home }, { name: title, url }]));
  if (key === "faq") {
    // The FAQ page itself is the FAQPage (one per page).
    out.push(faq ?? webPageLd({ name: title, url, storeUrl: home, description: pageDescription(store, key, title) }));
    return out.filter((entry): entry is JsonLd => Boolean(entry));
  }
  out.push(webPageLd({ type: pageSchemaType(key), name: title, url, storeUrl: home, description: pageDescription(store, key, title) }));
  if (key === "products") out.push(itemListLd({ name: title, url, items: products.slice(0, 100) }));
  out.push(faq);
  return out.filter((entry): entry is JsonLd => Boolean(entry));
}

/** The storefront with `pageKey` selected (home by default). `closedPath` is where "not open yet" sends the owner back to. */
export async function StorefrontRoute({ slug, storeBasePath, pageKey = "home", closedPath }: { slug: string; storeBasePath: string; pageKey?: string; closedPath: string | null }) {
  const view = await resolveStorefront(slug);
  if (view.access === "missing") notFound();
  if (view.access === "closed") return <StoreClosedPage store={view.brand} basePath={storeBasePath} path={closedPath} />;
  // The owner of a store that isn't live sees it with their builder draft, under the preview bar.
  if (view.access === "preview") return <PreviewClient store={view.store} storeBasePath={storeBasePath} live={false} initialPage={pageKey} />;

  const store: StoreData = view.store;
  const { googleAnalyticsId } = getIntegrations(store.brandSettings);
  const jsonLdItems = await storefrontJsonLd(store, slug, pageKey);

  return (
    <>
      {/* GA4 Analytics */}
      {googleAnalyticsId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${googleAnalyticsId}');`}
          </Script>
        </>
      )}

      {/* JSON-LD structured data (src/lib/seo/structured-data.ts) */}
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
