import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { renderPlanPage } from "@/components/storefront/together/pages.server";
import { NOINDEX_NOFOLLOW } from "@/lib/seo/indexing";

// The store's own domain: the same page as /s/<slug>/plan/<id>.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your plan", description: "Your Pay small small plan.", robots: NOINDEX_NOFOLLOW };

interface Props {
  params: Promise<{ domain: string; planId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ params, searchParams }: Props) {
  const { domain, planId } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  return renderPlanPage(storeRef.slug, planId, await searchParams, null);
}
