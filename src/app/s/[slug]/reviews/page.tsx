import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ReviewsWall } from "@/components/storefront/reviews/ReviewsWall";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadReviewsWall } from "@/lib/reviews/storefront";
import { NOINDEX_NOFOLLOW, storePageRobots } from "@/lib/seo/indexing";
import { storeSearchState, storeUrl } from "@/lib/seo/store-seo.server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [wall, state] = await Promise.all([loadReviewsWall(slug), storeSearchState(slug)]);
  if (!wall || !state) return { title: "Reviews", robots: NOINDEX_NOFOLLOW };
  const description = wall.summary.count ? `${wall.summary.average.toFixed(1)} out of 5 from ${wall.summary.count} customer reviews of ${wall.store.name}.` : `Customer reviews of ${wall.store.name}.`;
  const canonical = storeUrl(state.store, "/reviews");
  // Page 2+ of the wall: shown, followed, but the first page is the one to list.
  const paged = Number((await searchParams)?.page) > 1;
  return {
    title: { absolute: `Reviews | ${wall.store.name}` },
    description,
    alternates: { canonical },
    openGraph: { title: `Reviews of ${wall.store.name}`, description, url: canonical },
    robots: storePageRobots({ indexable: state.indexable, pageNoIndex: wall.summary.count === 0, variant: paged }),
  };
}

export default async function StoreReviewsWallPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const wall = await loadReviewsWall(slug);
  if (!wall) notFound();
  const page = Math.max(1, Number((await searchParams)?.page) || 1);
  const basePath = getStorefrontBasePathForHost((await headers()).get("host"), slug);
  return <ReviewsWall store={wall.store} reviews={wall.reviews} summary={wall.summary} basePath={basePath} page={page} />;
}
