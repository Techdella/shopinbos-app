import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { StorefrontRoute, storefrontMetadata } from "@/app/s/[slug]/storefront-route";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { legacyPageRedirectTarget, searchParamsFromRecord } from "@shared/storefront-pages";

// Custom-domain twin of /s/[slug]: the store's home; old /?page=about links redirect to /about.

interface Props {
  params: Promise<{ domain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) return { title: "Store not found" };
  return storefrontMetadata(storeRef.slug, "home", normalizeDomain(decodeURIComponent(domain)));
}

export default async function CustomDomainStorefrontPage({ params, searchParams }: Props) {
  const { domain } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  // Returns "" for custom domains (host ≠ platform domain) — links stay relative
  const storeBasePath = getStorefrontBasePathForHost((await headers()).get("host"), storeRef.slug);
  const legacy = legacyPageRedirectTarget(storeBasePath, searchParamsFromRecord(await searchParams));
  if (legacy) permanentRedirect(legacy);
  return <StorefrontRoute slug={storeRef.slug} storeBasePath={storeBasePath} closedPath={null} />;
}
