import type { Metadata } from "next";
import { headers } from "next/headers";
import { ReviewLinkPage } from "@/components/storefront/reviews/ReviewLinkPage";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { markRequestOpened, resolveReviewLink } from "@/lib/reviews/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leave a review", robots: { index: false, follow: false } };

export default async function ReviewLinkRoute({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const link = await resolveReviewLink(slug, decodeURIComponent(token));
  if (!link.error) await markRequestOpened(link.request.id);
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <ReviewLinkPage state={link.error ? { error: link.error, store: link.error === "expired" ? link.store : undefined } : { error: null, store: link.store, order: link.order, items: link.items }} slug={slug} token={decodeURIComponent(token)} basePath={basePath} />;
}
