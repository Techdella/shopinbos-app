import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadProductPage } from "@/lib/storefront/product-page.server";
import { canonicalProductUrl, productMetadata, ProductPageView } from "./ProductPageView";

interface Props {
  params: Promise<{ slug: string; productId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params;
  const data = await loadProductPage(slug, productId);
  return productMetadata(data, data ? canonicalProductUrl(data) : "");
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, productId } = await params;
  const data = await loadProductPage(slug, productId);
  if (!data) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return <ProductPageView data={data} storeBasePath={storeBasePath} canonical={canonicalProductUrl(data)} />;
}
