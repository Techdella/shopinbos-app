import { notFound } from "next/navigation";
import { Metadata } from "next";
import { headers } from "next/headers";
import { StorefrontClient } from "./StorefrontClient";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchStore(slug);
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

export default async function StorefrontPage({ params }: Props) {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) notFound();
  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return <StorefrontClient store={store} storeBasePath={storeBasePath} />;
}
