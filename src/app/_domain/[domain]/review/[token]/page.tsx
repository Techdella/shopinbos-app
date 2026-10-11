import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ReviewLinkPage } from "@/components/storefront/reviews/ReviewLinkPage";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { markRequestOpened, resolveReviewLink } from "@/lib/reviews/public";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leave a review", robots: { index: false, follow: false } };

export default async function CustomDomainReviewLinkRoute({ params }: { params: Promise<{ domain: string; token: string }> }) {
  const { domain, token } = await params;
  const ref = await getStoreByCustomDomain(domain);
  if (!ref) notFound();
  const link = await resolveReviewLink(ref.slug, decodeURIComponent(token));
  if (!link.error) await markRequestOpened(link.request.id);
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), ref.slug);
  return <ReviewLinkPage state={link.error ? { error: link.error, store: link.error === "expired" ? link.store : undefined } : { error: null, store: link.store, order: link.order, items: link.items }} slug={ref.slug} token={decodeURIComponent(token)} basePath={basePath} />;
}
