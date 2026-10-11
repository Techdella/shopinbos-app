import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ReviewsWall } from "@/components/storefront/reviews/ReviewsWall";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadReviewsWall } from "@/lib/reviews/storefront";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const wall = await loadReviewsWall(slug);
  if (!wall) return { title: "Reviews" };
  const description = wall.summary.count ? `${wall.summary.average.toFixed(1)} out of 5 from ${wall.summary.count} customer reviews of ${wall.store.name}.` : `Customer reviews of ${wall.store.name}.`;
  return { title: { absolute: `Reviews | ${wall.store.name}` }, description, openGraph: { title: `Reviews of ${wall.store.name}`, description } };
}

export default async function StoreReviewsWallPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const wall = await loadReviewsWall(slug);
  if (!wall) notFound();
  const page = Math.max(1, Number((await searchParams)?.page) || 1);
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <ReviewsWall store={wall.store} reviews={wall.reviews} summary={wall.summary} basePath={basePath} page={page} />;
}
