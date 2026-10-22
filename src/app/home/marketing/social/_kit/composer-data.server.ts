import "server-only";

import { db } from "@/lib/db/client";
import { nextQueueSlot } from "@/lib/social-posts/pure";
import { postAccountNames } from "@/lib/social-posts/server";
import { loadPostMedia, loadPostProducts } from "./media.server";
import { rexMakerData } from "./rex-data.server";

/**
 * Everything the composer needs besides the post: products, the media to pick from, accounts, the next queue time,
 * and what Rex's makers need to open in a pop-up.
 */
export async function composerData(userId: string, store: { id: string; name: string; slug: string; customDomain: string | null; logoUrl: string | null }, now = new Date()) {
  const [products, media, accounts, taken, rex] = await Promise.all([
    loadPostProducts(store),
    loadPostMedia(userId, store.id),
    postAccountNames(store.id),
    db.socialPost.findMany({ where: { storeId: store.id, status: "scheduled", scheduledAt: { gte: now } }, select: { scheduledAt: true }, take: 500 }).catch(() => []),
    rexMakerData(store),
  ]);
  const queueNext = nextQueueSlot(taken.map((row) => row.scheduledAt!).filter(Boolean), now).toISOString();
  return { products, media, accounts, queueNext, rex };
}
