import { notFound } from "next/navigation";
import { Metadata } from "next";
import { headers } from "next/headers";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ domain: string }>;
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) return { title: "Store not found" };
  const store = await fetchStore(storeRef.slug);
  if (!store) return { title: "Store not found" };
  return {
    title: store.name,
    description: store.description ?? `Shop at ${store.name}`,
    openGraph: {
      title: store.name,
      description: store.description ?? `Shop at ${store.name}`,
      images: store.logoUrl ? [store.logoUrl] : [],
    },
  };
}

export default async function CustomDomainStorefrontPage({ params }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();

  const store = await fetchStore(storeRef.slug);
  if (!store) notFound();

  const requestHeaders = await headers();
  // Returns "" for custom domains (host ≠ platform domain) — links stay relative
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);

  return <StorefrontClient store={store} storeBasePath={storeBasePath} />;
}
