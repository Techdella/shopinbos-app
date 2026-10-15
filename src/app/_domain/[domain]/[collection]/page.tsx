import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { collectionMetadata } from "@/lib/cms/storefront";
import { CollectionRoute } from "@/components/cms/storefront/routes";
import { isStorefrontPageAlias, searchParamsFromRecord, storefrontPageHref } from "@shared/storefront-pages";
import { liveStorefrontPageKey, StorefrontRoute, storefrontMetadata } from "@/app/s/[slug]/storefront-route";

// Custom-domain twin of /s/[slug]/[collection]: a store page (/shop, /about…), else a CMS collection, else 404.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ domain: string; collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, collection } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) return { title: "Not found" };
  const customDomain = normalizeDomain(decodeURIComponent(domain));
  const pageKey = await liveStorefrontPageKey(store.slug, collection);
  if (pageKey) return storefrontMetadata(store.slug, pageKey, customDomain);
  return collectionMetadata(store.slug, collection, customDomain);
}

export default async function Page({ params, searchParams }: Props) {
  const { domain, collection } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) notFound();
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), store.slug);
  const pageKey = await liveStorefrontPageKey(store.slug, collection);
  if (pageKey) {
    if (isStorefrontPageAlias(collection, pageKey)) {
      const target = storefrontPageHref(basePath, pageKey, searchParamsFromRecord(await searchParams));
      if (target) permanentRedirect(target);
    }
    return <StorefrontRoute slug={store.slug} storeBasePath={basePath} pageKey={pageKey} closedPath={null} />;
  }
  return <CollectionRoute storeSlug={store.slug} collectionSlug={collection} basePath={basePath} customDomain={normalizeDomain(decodeURIComponent(domain))} />;
}
