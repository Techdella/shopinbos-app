import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { withProductSeo } from "@/lib/cms/storefront";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadProductPage } from "@/lib/storefront/product-page.server";
import { resolveStorefront } from "@/lib/storefront/public-store.server";
import { PreviewFrame } from "@/components/storefront/shopper/PreviewBar";
import { StoreClosedPage } from "@/components/storefront/shopper/StoreClosedPage";
import { canonicalProductUrl, productMetadata, ProductPageView } from "./ProductPageView";

interface Props {
  params: Promise<{ slug: string; productId: string }>;
}

/** The live product, or (store not live) the owner's preview of it, or the "not open yet" page. */
async function loadProductRoute(slug: string, productId: string) {
  const live = await loadProductPage(slug, productId);
  if (live) return { kind: "live" as const, data: live };
  const view = await resolveStorefront(slug);
  if (view.access === "closed") return { kind: "closed" as const, brand: view.brand };
  if (view.access === "preview") {
    const data = await loadProductPage(slug, productId, true);
    if (data) return { kind: "preview" as const, data };
  }
  return { kind: "missing" as const };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params;
  const route = await loadProductRoute(slug, productId);
  if (route.kind === "closed") return { title: { absolute: route.brand.name }, robots: { index: false, follow: false } };
  if (route.kind === "preview") return { ...productMetadata(route.data, ""), robots: { index: false, follow: false } };
  const data = route.kind === "live" ? route.data : null;
  return withProductSeo(productMetadata(data, data ? canonicalProductUrl(data) : ""), data?.product.id);
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, productId } = await params;
  const route = await loadProductRoute(slug, productId);
  if (route.kind === "missing") notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);
  if (route.kind === "closed") return <StoreClosedPage store={route.brand} basePath={storeBasePath} path={`/s/${slug}/product/${productId}`} />;

  const view = <ProductPageView data={route.data} storeBasePath={storeBasePath} canonical={canonicalProductUrl(route.data)} />;
  return route.kind === "preview" ? <PreviewFrame>{view}</PreviewFrame> : view;
}
