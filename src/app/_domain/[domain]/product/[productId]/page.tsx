import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { withProductSeo } from "@/lib/cms/storefront";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { loadProductPage } from "@/lib/storefront/product-page.server";
import { canonicalProductUrl, productMetadata, ProductPageView } from "@/app/s/[slug]/product/[productId]/ProductPageView";

interface Props {
  params: Promise<{ domain: string; productId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, productId } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) return { title: "Product not found" };
  const data = await loadProductPage(storeRef.slug, productId);
  return withProductSeo(productMetadata(data, data ? canonicalProductUrl(data, normalizeDomain(decodeURIComponent(domain))) : ""), data?.product.id);
}

export default async function CustomDomainProductPage({ params }: Props) {
  const { domain, productId } = await params;

  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();

  const data = await loadProductPage(storeRef.slug, productId);
  if (!data) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);

  return <ProductPageView data={data} storeBasePath={storeBasePath} canonical={canonicalProductUrl(data, normalizeDomain(decodeURIComponent(domain)))} />;
}
