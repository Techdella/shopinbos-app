import type { Metadata } from "next";
import { renderPlanPage } from "@/components/storefront/together/pages.server";
import { NOINDEX_NOFOLLOW } from "@/lib/seo/indexing";

// Pilot storefront page (src/components/storefront/together/pages.server.tsx); the store's own domain has the same page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your plan", description: "Your Pay small small plan.", robots: NOINDEX_NOFOLLOW };

interface Props {
  params: Promise<{ slug: string; planId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ params, searchParams }: Props) {
  const { slug, planId } = await params;
  return renderPlanPage(slug, planId, await searchParams, `/s/${slug}/plan/${planId}`);
}
