import { notFound } from "next/navigation";
import { Metadata } from "next";
import { headers } from "next/headers";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { buildStorefrontUrl, getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { storePageSeo } from "@/lib/seo/page-seo";
import { seoMetadata } from "@/lib/seo/fields";
import { resolveStorefront } from "@/lib/storefront/public-store.server";
import { StoreClosedPage } from "@/components/storefront/shopper/StoreClosedPage";
import { PreviewClient } from "@/app/s/[slug]/preview/PreviewClient";

interface Props {
  params: Promise<{ domain: string }>;
}


export async function generateMetadata({ params, searchParams }: Props & { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) return { title: "Store not found" };
  const view = await resolveStorefront(storeRef.slug);
  if (view.access === "missing") return { title: "Store not found" };
  if (view.access === "closed") return { title: { absolute: view.brand.name }, robots: { index: false, follow: false } };
  if (view.access === "preview") return { title: { absolute: `Preview: ${view.store.name}` }, robots: { index: false, follow: false } };
  const store = view.store;
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

  const view = await resolveStorefront(storeRef.slug);
  if (view.access === "missing") notFound();

  const requestHeaders = await headers();
  // Returns "" for custom domains (host ≠ platform domain) — links stay relative
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);
  if (view.access === "closed") return <StoreClosedPage store={view.brand} basePath={storeBasePath} path={null} />;
  if (view.access === "preview") return <PreviewClient store={view.store} storeBasePath={storeBasePath} live={false} />;

  return <StorefrontClient store={view.store} storeBasePath={storeBasePath} />;
}
