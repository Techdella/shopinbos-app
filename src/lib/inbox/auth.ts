import "server-only";

import { db } from "@/lib/db/client";

/** The signed-in seller's store, for the inbox API routes. */
export async function sellerStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, name: true, slug: true, userId: true } });
}
