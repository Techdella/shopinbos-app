import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost, normalizeDomain } from "@/lib/domains/storefront";
import { LegalRoute, legalMetadata } from "@/components/legal/routes";

// Custom-domain twin of /s/[slug]/policies/[key]. Owner previews use the app address (the seller's
// session cookie lives there), so drafts never show here.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ domain: string; key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, key } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) return { title: "Not found" };
  return legalMetadata(store.slug, key, false, normalizeDomain(decodeURIComponent(domain)));
}

export default async function Page({ params }: Props) {
  const { domain, key } = await params;
  const store = await getStoreByCustomDomain(domain);
  if (!store) notFound();
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), store.slug);
  return <LegalRoute storeSlug={store.slug} pageKey={key} basePath={basePath} previewWanted={false} />;
}
