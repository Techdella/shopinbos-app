import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckoutClient } from "@/app/s/[slug]/checkout/CheckoutClient";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ domain: string }>;
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export default async function CustomDomainCheckoutPage({ params }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();

  const store = await fetchStore(storeRef.slug);
  if (!store) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);

  return <CheckoutClient store={store} storeBasePath={storeBasePath} />;
}
