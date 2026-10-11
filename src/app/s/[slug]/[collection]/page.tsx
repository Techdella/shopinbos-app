import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { collectionMetadata } from "@/lib/cms/storefront";
import { CollectionRoute } from "@/components/cms/storefront/routes";

// A CMS collection's list page (Blog, Size guide, Recipes…). Static store routes (cart, product, blog…)
// take precedence; collection slugs can't use those names.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; collection: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, collection } = await params;
  return collectionMetadata(slug, collection);
}

export default async function StoreCollectionPage({ params }: Props) {
  const { slug, collection } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <CollectionRoute storeSlug={slug} collectionSlug={collection} basePath={basePath} />;
}
