import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ReviewsWall } from "@/components/storefront/reviews/ReviewsWall";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadReviewsWall } from "@/lib/reviews/storefront";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ domain: string }>;
  searchParams?: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const ref = await getStoreByCustomDomain(domain);
  const wall = ref ? await loadReviewsWall(ref.slug) : null;
  return wall ? { title: { absolute: `Reviews | ${wall.store.name}` } } : { title: "Reviews" };
}

export default async function CustomDomainReviewsWallPage({ params, searchParams }: Props) {
  const { domain } = await params;
  const ref = await getStoreByCustomDomain(domain);
  if (!ref) notFound();
  const wall = await loadReviewsWall(ref.slug);
  if (!wall) notFound();
  const page = Math.max(1, Number((await searchParams)?.page) || 1);
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), ref.slug);
  return <ReviewsWall store={wall.store} reviews={wall.reviews} summary={wall.summary} basePath={basePath} page={page} />;
}
