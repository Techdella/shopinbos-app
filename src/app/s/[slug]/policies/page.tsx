import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { LegalIndexRoute, legalIndexMetadata } from "@/components/legal/routes";

// The store's published legal pages (privacy, terms, returns, delivery…).
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return legalIndexMetadata(slug);
}

export default async function StorePoliciesPage({ params }: Props) {
  const { slug } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <LegalIndexRoute storeSlug={slug} basePath={basePath} />;
}
