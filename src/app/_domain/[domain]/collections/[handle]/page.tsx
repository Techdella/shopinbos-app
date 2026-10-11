import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { productCollectionMetadata } from "@/lib/cms/storefront";
import { ProductCollectionRoute } from "@/components/cms/storefront/ProductCollectionView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ domain: string; handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, handle } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) return { title: "Not found" };
  return productCollectionMetadata(store.slug, handle, normalizeDomain(decodeURIComponent(domain)));
}

export default async function Page({ params }: Props) {
  const { domain, handle } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) notFound();
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), store.slug);
  return <ProductCollectionRoute storeSlug={store.slug} handle={handle} basePath={basePath} customDomain={normalizeDomain(decodeURIComponent(domain))} />;
}
