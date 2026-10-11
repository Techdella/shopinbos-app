import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckoutClient } from "./CheckoutClient";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadCheckoutPayments } from "./payment-props";

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

export default async function CheckoutPage({ params }: Props) {
  const { slug } = await params;
  const store = await fetchStore(slug);
  if (!store) notFound();
  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  const { payments, feeZones } = await loadCheckoutPayments(slug);

  return <CheckoutClient store={store} storeBasePath={storeBasePath} payments={payments} feeZones={feeZones} />;
}
