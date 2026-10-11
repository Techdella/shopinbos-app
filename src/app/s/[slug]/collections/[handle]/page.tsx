import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { productCollectionMetadata } from "@/lib/cms/storefront";
import { ProductCollectionRoute } from "@/components/cms/storefront/ProductCollectionView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, handle } = await params;
  return productCollectionMetadata(slug, handle);
}

export default async function StoreProductCollectionPage({ params }: Props) {
  const { slug, handle } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <ProductCollectionRoute storeSlug={slug} handle={handle} basePath={basePath} />;
}
