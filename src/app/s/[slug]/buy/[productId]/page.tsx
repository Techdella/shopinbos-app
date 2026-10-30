import type { Metadata } from "next";
import { renderBuyWaysPage } from "@/components/storefront/together/pages.server";
import { NOINDEX_NOFOLLOW } from "@/lib/seo/indexing";

// Pilot storefront page (src/components/storefront/together/pages.server.tsx); the store's own domain has the same page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Other ways to buy", description: "Pay small small, buy with friends, or join an ajo group for this product.", robots: NOINDEX_NOFOLLOW };

interface Props {
  params: Promise<{ slug: string; productId: string }>;
}

export default async function Page({ params }: Props) {
  const { slug, productId } = await params;
  return renderBuyWaysPage(slug, productId, `/s/${slug}/buy/${productId}`);
}
