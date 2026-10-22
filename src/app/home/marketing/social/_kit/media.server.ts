import "server-only";

import { db } from "@/lib/db/client";
import { productLink } from "@/lib/social/server";
import { naira } from "@shared/onboarding";
import type { PickMedia } from "./types";

// What a post can use: Rex's pictures (saved to the media library as source "ai"), the reels made in the Video
// studio, the rest of the media library and the product photos. Newest first; the picker and Rex designs page.

export async function loadPostMedia(userId: string, storeId: string): Promise<{ rex: PickMedia[]; reels: PickMedia[]; library: PickMedia[]; products: PickMedia[] }> {
  const [ai, videos, library, products] = await Promise.all([
    db.mediaAsset.findMany({ where: { userId, source: "ai", hiddenAt: null }, orderBy: { createdAt: "desc" }, take: 60, select: { id: true, url: true, kind: true, width: true, height: true, title: true, name: true, path: true, createdAt: true } }).catch(() => []),
    db.videoProject.findMany({ where: { storeId, videoUrl: { not: null } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, videoUrl: true, posterUrl: true, updatedAt: true } }).catch(() => []),
    db.mediaAsset.findMany({ where: { userId, source: { not: "ai" }, hiddenAt: null }, orderBy: { createdAt: "desc" }, take: 60, select: { id: true, url: true, kind: true, width: true, height: true, title: true, name: true, createdAt: true } }).catch(() => []),
    db.storeProduct.findMany({ where: { storeId, status: "published", images: { isEmpty: false } }, orderBy: [{ featured: "desc" }, { createdAt: "desc" }], take: 40, select: { id: true, name: true, images: true, createdAt: true } }).catch(() => []),
  ]);
  const logo = (path: string | null) => Boolean(path?.startsWith("logos/"));
  return {
    rex: ai
      .filter((row) => !logo(row.path))
      .map((row) => ({ id: row.id, url: row.url, kind: row.kind === "video" ? "video" : "image", source: "rex", label: row.title ?? row.name ?? null, width: row.width, height: row.height, poster: null, createdAt: row.createdAt.toISOString() })),
    reels: videos.map((row) => ({ id: row.id, url: row.videoUrl!, kind: "video", source: "reel", label: row.title, width: 1080, height: 1920, poster: row.posterUrl, createdAt: row.updatedAt.toISOString() })),
    library: library.map((row) => ({ id: row.id, url: row.url, kind: row.kind === "video" ? "video" : "image", source: "library", label: row.title ?? row.name ?? null, width: row.width, height: row.height, poster: null, createdAt: row.createdAt.toISOString() })),
    products: products.map((row) => ({ id: row.id, url: row.images[0], kind: "image", source: "product", label: row.name, width: null, height: null, poster: null, createdAt: row.createdAt.toISOString() })),
  };
}

/** The products a post can link to (and Peggy can write about). */
export async function loadPostProducts(store: { id: string; slug: string; customDomain: string | null }) {
  const products = await db.storeProduct
    .findMany({ where: { storeId: store.id, status: "published" }, orderBy: [{ featured: "desc" }, { createdAt: "desc" }], take: 200, select: { id: true, name: true, retailPrice: true, images: true } })
    .catch(() => []);
  return products.map((product) => ({ id: product.id, name: product.name, price: naira(product.retailPrice), image: product.images[0] ?? null, url: productLink(store, product.id) }));
}
