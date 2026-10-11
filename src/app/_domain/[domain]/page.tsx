import { notFound } from "next/navigation";
import { Metadata } from "next";
import { headers } from "next/headers";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { buildStorefrontUrl, getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { storePageSeo } from "@/lib/seo/page-seo";
import { seoMetadata } from "@/lib/seo/fields";

interface Props {
  params: Promise<{ domain: string }>;
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function generateMetadata({ params, searchParams }: Props & { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) return { title: "Store not found" };
  const store = await fetchStore(storeRef.slug);
  if (!store) return { title: "Store not found" };
  const requested = (await searchParams).page;
  const pageSeo = typeof requested === "string" ? storePageSeo(store, requested) : null;
  if (pageSeo) {
    return seoMetadata(pageSeo.seo, {
      title: pageSeo.title,
      titleSuffix: store.name,
      description: store.description ?? "",
      image: store.logoUrl,
      canonical: buildStorefrontUrl({ slug: storeRef.slug, customDomain: normalizeDomain(decodeURIComponent(domain)) }, `/?page=${encodeURIComponent(requested as string)}`),
      siteName: store.name,
    }) as Metadata;
  }
  return {
    title: store.name,
    description: store.description ?? `Shop at ${store.name}`,
    openGraph: {
      title: store.name,
      description: store.description ?? `Shop at ${store.name}`,
      images: store.logoUrl ? [store.logoUrl] : [],
    },
  };
}

export default async function CustomDomainStorefrontPage({ params }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();

  const store = await fetchStore(storeRef.slug);
  if (!store) notFound();

  const requestHeaders = await headers();
  // Returns "" for custom domains (host ≠ platform domain) — links stay relative
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);

  return <StorefrontClient store={store} storeBasePath={storeBasePath} />;
}
