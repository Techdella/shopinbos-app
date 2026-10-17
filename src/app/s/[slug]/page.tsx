import type { Metadata } from "next";
import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { legacyPageRedirectTarget, searchParamsFromRecord } from "@shared/storefront-pages";
import { StorefrontRoute, storefrontMetadata } from "./storefront-route";

// A store's home page. Its other pages live at their own addresses (/shop, /about…: see [collection]/page.tsx);
// old /?page=about links redirect there, keeping the rest of the query.

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  return storefrontMetadata(slug, "home", null, await searchParams);
}

export default async function StorefrontPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const storeBasePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  const legacy = legacyPageRedirectTarget(storeBasePath, searchParamsFromRecord(await searchParams));
  if (legacy) permanentRedirect(legacy);
  return <StorefrontRoute slug={slug} storeBasePath={storeBasePath} closedPath={`/s/${slug}`} />;
}
