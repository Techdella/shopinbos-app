import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { itemMetadata } from "@/lib/cms/storefront";
import { ItemRoute } from "@/components/cms/storefront/routes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; collection: string; item: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, collection, item } = await params;
  return itemMetadata(slug, collection, item);
}

export default async function StoreCollectionItemPage({ params }: Props) {
  const { slug, collection, item } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <ItemRoute storeSlug={slug} collectionSlug={collection} itemSlug={item} basePath={basePath} />;
}
