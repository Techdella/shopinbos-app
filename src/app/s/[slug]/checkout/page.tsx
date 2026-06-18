import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckoutClient } from "./CheckoutClient";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchStore(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${baseUrl}/api/public/store/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

export default async function CheckoutPage({ params }: Props) {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) notFound();
  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return <CheckoutClient store={store} storeBasePath={storeBasePath} />;
}
