import "server-only";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { publicName, publicReviews, sourceLabel, summarizeReviews } from "./pure";
import { loadReviews, productNames } from "./server";

export interface WallReview {
  key: string;
  name: string;
  photoUrl: string | null;
  rating: number | null;
  title: string;
  body: string;
  images: string[];
  source: string;
  imported: boolean;
  verifiedBuyer: boolean;
  featured: boolean;
  reply: string | null;
  date: string;
  product: { id: string; name: string } | null;
}

/** The public reviews wall: published reviews from every source, featured first. */
export const loadReviewsWall = cache(async (slug: string) => {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, logoUrl: true, description: true, status: true } });
  if (!store || store.status !== "active") return null;
  const items = publicReviews(await loadReviews(store.id, { approvedOnly: true, take: 1000 }));
  const products = await productNames(store.id, [...new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))]);
  const reviews: WallReview[] = items.map((item) => {
    const product = item.productId ? products.get(item.productId) : null;
    return {
      key: item.key,
      name: publicName(item.authorName),
      photoUrl: item.authorPhotoUrl,
      rating: item.rating,
      title: item.title,
      body: item.body,
      images: item.images,
      source: sourceLabel(item.source),
      imported: item.kind === "external",
      verifiedBuyer: item.verifiedBuyer,
      featured: item.featured,
      reply: item.reply,
      date: item.createdAt,
      product: product && item.productId ? { id: item.productId, name: product.name } : null,
    };
  });
  return { store: { name: store.name, slug: store.slug, logoUrl: store.logoUrl, description: store.description }, reviews, summary: summarizeReviews(items) };
});
