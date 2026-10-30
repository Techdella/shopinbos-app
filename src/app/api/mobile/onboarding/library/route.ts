import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { libraryFor } from "@/lib/onboarding/rex-build.server";
import { readRexBuild } from "@shared/seller-onboarding";

export const dynamic = "force-dynamic";

// GET /api/mobile/onboarding/library → { photos: [{ id, url, thumb, category, licence }] }
// Rex's photo library (design RB-07 "From Rex's photo library", RB-11): hair and beauty, people, backgrounds, and the
// seller's own product photos. TODO(licence): confirm sellers may use the library photos in their shops (spec §8).
export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  const images = store
    ? (await db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, select: { images: true }, take: 40 })).flatMap((row) => row.images.slice(0, 1))
    : [];
  return ok({ photos: libraryFor(readRexBuild(store?.brandSettings).categories, images) });
});
