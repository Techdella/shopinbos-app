import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { collectionMetadata } from "@/lib/cms/storefront";
import { CollectionRoute } from "@/components/cms/storefront/routes";

// Custom-domain twin of the /s/[slug] CMS page.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ domain: string; collection: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, collection } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) return { title: "Not found" };
  return collectionMetadata(store.slug, collection, normalizeDomain(decodeURIComponent(domain)));
}

export default async function Page({ params }: Props) {
  const { domain, collection } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) notFound();
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), store.slug);
  return <CollectionRoute storeSlug={store.slug} collectionSlug={collection} basePath={basePath} customDomain={normalizeDomain(decodeURIComponent(domain))} />;
}
