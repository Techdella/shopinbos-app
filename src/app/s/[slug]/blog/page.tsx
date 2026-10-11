import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { collectionMetadata } from "@/lib/cms/storefront";
import { CollectionRoute } from "@/components/cms/storefront/routes";

// /blog is the Blog collection (old posts were copied into it, so their links keep working).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return collectionMetadata(slug, "blog");
}

export default async function StoreBlogPage({ params }: Props) {
  const { slug } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <CollectionRoute storeSlug={slug} collectionSlug="blog" basePath={basePath} />;
}
