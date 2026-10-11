import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckoutClient } from "@/app/s/[slug]/checkout/CheckoutClient";
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
  return { title: storeRef ? "Checkout" : "Store not found", robots: { index: false } };
}

export default async function CustomDomainCheckoutPage({ params }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();

  const [store, commerce] = await Promise.all([fetchPublicStore(storeRef.slug), loadCommerceContext(storeRef.slug)]);
  if (!store) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);

  return (
    <Suspense>
      <CheckoutClient store={store} storeBasePath={storeBasePath} commerce={commerce} />
    </Suspense>
  );
}
