import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { WishlistPage } from "@/components/storefront/shopper/WishlistPage";
import { fetchPublicStore, loadCommerceContext } from "@/lib/commerce/storefront.server";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchPublicStore(slug);
  return { title: store ? `Wishlist | ${store.name}` : "Wishlist", robots: { index: false } };
}

export default async function StoreWishlistPage({ params }: Props) {
  const { slug } = await params;
  const [store, commerce] = await Promise.all([fetchPublicStore(slug), loadCommerceContext(slug)]);
  if (!store) notFound();
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return (
    <Suspense>
      <WishlistPage store={store} basePath={basePath} commerce={commerce} />
    </Suspense>
  );
}
