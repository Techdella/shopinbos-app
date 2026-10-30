import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { renderGroupPage } from "@/components/storefront/together/pages.server";
import { NOINDEX_NOFOLLOW } from "@/lib/seo/indexing";

// The store's own domain: the same page as /s/<slug>/group/<id>.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Buy with friends", description: "Join this group buy: a lower price when the group fills.", robots: NOINDEX_NOFOLLOW };

interface Props {
  params: Promise<{ domain: string; groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ params, searchParams }: Props) {
  const { domain, groupId } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  return renderGroupPage(storeRef.slug, groupId, await searchParams, null);
}
