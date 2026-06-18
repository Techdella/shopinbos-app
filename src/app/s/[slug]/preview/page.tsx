import { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { PreviewClient } from "./PreviewClient";
import { PreviewFallbackClient } from "./PreviewFallbackClient";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) return { title: "Store Preview", robots: "noindex, nofollow" as const };
  return {
    title: `Preview: ${store.name}`,
    description: store.description ?? `Preview of ${store.name}`,
    robots: "noindex, nofollow" as const,
  };
}

export default async function PreviewPage({ params }: Props) {
  const { slug } = await params;
  const store = await fetchStore(slug);

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  // If store exists on public API, render with published + draft data
  if (store) {
    return <PreviewClient store={store} storeBasePath={storeBasePath} slug={slug} />;
  }

  // If store not published yet, try to load from editor API (requires auth)
  return <PreviewFallbackClient storeBasePath={storeBasePath} slug={slug} />;
}
