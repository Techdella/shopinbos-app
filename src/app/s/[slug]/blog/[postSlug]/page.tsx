import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { itemMetadata } from "@/lib/cms/storefront";
import { ItemRoute } from "@/components/cms/storefront/routes";

// Old blog post URLs: the post now lives in the Blog collection under the same slug.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; postSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postSlug } = await params;
  return itemMetadata(slug, "blog", postSlug);
}

export default async function StoreBlogPostPage({ params }: Props) {
  const { slug, postSlug } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <ItemRoute storeSlug={slug} collectionSlug="blog" itemSlug={postSlug} basePath={basePath} />;
}
