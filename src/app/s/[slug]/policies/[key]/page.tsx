import type { Metadata } from "next";
import { headers } from "next/headers";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { LegalRoute, legalMetadata } from "@/components/legal/routes";

// One legal page, full page in the store's theme. ?preview=1 lets the owner see an unpublished page.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, key } = await params;
  return legalMetadata(slug, key, (await searchParams).preview === "1");
}

export default async function StorePolicyPage({ params, searchParams }: Props) {
  const { slug, key } = await params;
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <LegalRoute storeSlug={slug} pageKey={key} basePath={basePath} previewWanted={(await searchParams).preview === "1"} />;
}
