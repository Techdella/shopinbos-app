import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckoutClient } from "./CheckoutClient";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { fetchPublicStore, loadCommerceContext } from "@/lib/commerce/storefront.server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchPublicStore(slug);
  return { title: store ? `Checkout | ${store.name}` : "Checkout", robots: { index: false } };
}

export default async function CheckoutPage({ params }: Props) {
  const { slug } = await params;
  const [store, commerce] = await Promise.all([fetchPublicStore(slug), loadCommerceContext(slug)]);
  if (!store) notFound();
  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return (
    <Suspense>
      <CheckoutClient store={store} storeBasePath={storeBasePath} commerce={commerce} />
    </Suspense>
  );
}
