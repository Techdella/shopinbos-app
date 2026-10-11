import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { WishlistPage } from "@/components/storefront/shopper/WishlistPage";
import { fetchPublicStore, loadCommerceContext } from "@/lib/commerce/storefront.server";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  return { title: storeRef ? "Wishlist" : "Store not found", robots: { index: false } };
}

export default async function CustomDomainWishlistPage({ params }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  const [store, commerce] = await Promise.all([fetchPublicStore(storeRef.slug), loadCommerceContext(storeRef.slug)]);
  if (!store) notFound();
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), storeRef.slug);
  return (
    <Suspense>
      <WishlistPage store={store} basePath={basePath} commerce={commerce} />
    </Suspense>
  );
}
