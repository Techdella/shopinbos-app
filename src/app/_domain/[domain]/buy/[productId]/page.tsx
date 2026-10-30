import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { renderBuyWaysPage } from "@/components/storefront/together/pages.server";
import { NOINDEX_NOFOLLOW } from "@/lib/seo/indexing";

// The store's own domain: the same page as /s/<slug>/buy/<id>.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Other ways to buy", description: "Pay small small, buy with friends, or join an ajo group for this product.", robots: NOINDEX_NOFOLLOW };

interface Props {
  params: Promise<{ domain: string; productId: string }>;
}

export default async function Page({ params }: Props) {
  const { domain, productId } = await params;
  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();
  return renderBuyWaysPage(storeRef.slug, productId, null);
}
