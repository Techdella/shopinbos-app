import type { Metadata } from "next";
import { renderGroupPage } from "@/components/storefront/together/pages.server";
import { NOINDEX_NOFOLLOW } from "@/lib/seo/indexing";

// Pilot storefront page (src/components/storefront/together/pages.server.tsx); the store's own domain has the same page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Buy with friends", description: "Join this group buy: a lower price when the group fills.", robots: NOINDEX_NOFOLLOW };

interface Props {
  params: Promise<{ slug: string; groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ params, searchParams }: Props) {
  const { slug, groupId } = await params;
  return renderGroupPage(slug, groupId, await searchParams, `/s/${slug}/group/${groupId}`);
}
