import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { StorefrontClient } from "./StorefrontClient";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ slug: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreData = any;

async function fetchStore(slug: string): Promise<StoreData> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

function getIntegrations(brandSettings?: Record<string, unknown>) {
  const integrations = brandSettings?.integrations;
  if (!integrations || typeof integrations !== "object") return {};
  const i = integrations as Record<string, unknown>;
  return {
    googleAnalyticsId: typeof i.googleAnalyticsId === "string" ? i.googleAnalyticsId.trim() : "",
    gaSiteVerification: typeof i.gaSiteVerification === "string" ? i.gaSiteVerification.trim() : "",
  };
}

function getSeoSettings(brandSettings?: Record<string, unknown>) {
  const seo = brandSettings?.seo;
  if (!seo || typeof seo !== "object") return {};
  const s = seo as Record<string, unknown>;
  return {
    title: typeof s.title === "string" ? s.title.trim() : "",
    description: typeof s.description === "string" ? s.description.trim() : "",
    keywords: typeof s.keywords === "string" ? s.keywords.trim() : "",
    socialImage: typeof s.socialImage === "string" ? s.socialImage.trim() : "",
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) return { title: "Store not found" };

  const seo = getSeoSettings(store.brandSettings);
  const { gaSiteVerification } = getIntegrations(store.brandSettings);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";

  const title = seo.title || store.name;
  const description = seo.description || store.description || `Shop at ${store.name}`;
  const image = seo.socialImage || store.logoUrl || null;
  const canonicalUrl = `${appUrl}/s/${slug}`;

  return {
    title,
    description,
    keywords: seo.keywords || undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: store.name,
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
    },
    ...(gaSiteVerification
      ? { verification: { google: gaSiteVerification } }
      : {}),
  };
}

function buildJsonLd(store: StoreData) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const storeUrl = `${appUrl}/s/${store.slug}`;

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
      target: `${storeUrl}/search?q={search_term_string}`,
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
  const store = await fetchStore(slug);
  if (!store) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}

      <StorefrontClient store={store} storeBasePath={storeBasePath} />
    </>
  );
}
