import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { StorefrontClient } from "./StorefrontClient";
import { buildStorefrontUrl, getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { storeHomeMetadata } from "@/lib/seo/store-head";
import { storePageSeo } from "@/lib/seo/page-seo";
import { seoMetadata } from "@/lib/seo/fields";
import { resolveStorefront } from "@/lib/storefront/public-store.server";
import { StoreClosedPage } from "@/components/storefront/shopper/StoreClosedPage";
import { PreviewClient } from "./preview/PreviewClient";
import { gaMeasurementId, scriptSafeJson } from "@/lib/security/html";

interface Props {
  params: Promise<{ slug: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreData = any;


function getIntegrations(brandSettings?: Record<string, unknown>) {
  const integrations = brandSettings?.integrations;
  if (!integrations || typeof integrations !== "object") return {};
  const i = integrations as Record<string, unknown>;
  return {
    // Written into an inline script below, so only a well-formed GA4 ID is used.
    googleAnalyticsId: gaMeasurementId(i.googleAnalyticsId),
    gaSiteVerification: typeof i.gaSiteVerification === "string" ? i.gaSiteVerification.trim() : "",
  };
}

export async function generateMetadata({ params, searchParams }: Props & { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { slug } = await params;
  const view = await resolveStorefront(slug);
  if (view.access === "missing") return { title: "Store not found" };
  // Not live yet: the owner's preview or the "not open yet" page, neither of which should be indexed.
  if (view.access === "closed") return { title: { absolute: view.brand.name }, robots: { index: false, follow: false } };
  if (view.access === "preview") return { title: { absolute: `Preview: ${view.store.name}` }, robots: { index: false, follow: false } };
  const store: StoreData = view.store;

  // ?page=about etc.: that page's own SEO tab.
  const requested = (await searchParams).page;
  const pageSeo = typeof requested === "string" ? storePageSeo(store, requested) : null;
  if (pageSeo) {
    return seoMetadata(pageSeo.seo, {
      title: pageSeo.title,
      titleSuffix: store.name,
      description: store.description ?? "",
      image: store.logoUrl,
      canonical: buildStorefrontUrl({ slug, customDomain: store.customDomain ?? null }, `/?page=${encodeURIComponent(requested as string)}`),
      siteName: store.name,
    }) as Metadata;
  }

  const { gaSiteVerification } = getIntegrations(store.brandSettings);
  // Canonical: the store's real address (its own domain, mybos.store subdomain or app.shopinbos.com/s/<slug>).
  return storeHomeMetadata(store, buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null }), gaSiteVerification || undefined);
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
      target: `${storeUrl}?q={search_term_string}`,
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
      url: `${storeUrl}/product/${p.id}`,
      seller: {
        "@type": "Organization",
        name: store.name,
      },
    },
  }));

  return [organization, website, ...products];
}

export default async function StorefrontPage({ params }: Props) {
  const { slug } = await params;
  const view = await resolveStorefront(slug);
  if (view.access === "missing") notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);
  if (view.access === "closed") return <StoreClosedPage store={view.brand} basePath={storeBasePath} path={`/s/${slug}`} />;
  // The owner of a store that isn't live sees it with their builder draft, under the preview bar.
  if (view.access === "preview") return <PreviewClient store={view.store} storeBasePath={storeBasePath} live={false} />;

  const store: StoreData = view.store;
  const { googleAnalyticsId } = getIntegrations(store.brandSettings);
  const jsonLdItems = buildJsonLd(store);

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

      {/* JSON-LD Structured Data (Google Merchant + rich snippets) */}
      {jsonLdItems.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: scriptSafeJson(item) }}
        />
      ))}

      <StorefrontClient store={store} storeBasePath={storeBasePath} />
    </>
  );
}
