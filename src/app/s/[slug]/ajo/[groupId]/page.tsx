import type { Metadata } from "next";
import { renderAjoPage } from "@/components/storefront/together/pages.server";
import { NOINDEX_NOFOLLOW } from "@/lib/seo/indexing";

// Pilot storefront page (src/components/storefront/together/pages.server.tsx); the store's own domain has the same page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ajo group", description: "Join this shop's ajo group.", robots: NOINDEX_NOFOLLOW };

interface Props {
  params: Promise<{ slug: string; groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ params, searchParams }: Props) {
  const { slug, groupId } = await params;
  return renderAjoPage(slug, groupId, await searchParams, `/s/${slug}/ajo/${groupId}`);
}
