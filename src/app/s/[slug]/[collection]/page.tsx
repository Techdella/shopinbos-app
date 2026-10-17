import type { Metadata } from "next";
import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { collectionMetadata } from "@/lib/cms/storefront";
import { CollectionRoute } from "@/components/cms/storefront/routes";
import { isStorefrontPageAlias, searchParamsFromRecord, storefrontPageHref } from "@shared/storefront-pages";
import { liveStorefrontPageKey, StorefrontRoute, storefrontMetadata } from "../storefront-route";

// One segment under a store: one of its pages (/shop, /about, /contact, /faq, a custom page…) when the store has
// it, else a CMS collection's list page (Blog, Size guide, Recipes…), else 404. Static store routes (cart,
// product, blog…) take precedence; neither pages nor collections can use those names.

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, collection } = await params;
  const pageKey = await liveStorefrontPageKey(slug, collection);
  if (pageKey) return storefrontMetadata(slug, pageKey, null, await searchParams);
  return collectionMetadata(slug, collection);
}

export default async function StoreCollectionPage({ params, searchParams }: Props) {
  const { slug, collection } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  const pageKey = await liveStorefrontPageKey(slug, collection);
  if (pageKey) {
    // /products → /shop: one address per page.
    if (isStorefrontPageAlias(collection, pageKey)) {
      const target = storefrontPageHref(basePath, pageKey, searchParamsFromRecord(await searchParams));
      if (target) permanentRedirect(target);
    }
    return <StorefrontRoute slug={slug} storeBasePath={basePath} pageKey={pageKey} closedPath={`/s/${slug}`} />;
  }
  return <CollectionRoute storeSlug={slug} collectionSlug={collection} basePath={basePath} />;
}
