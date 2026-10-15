import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { feedHealth } from "@/lib/social/server";
import { COMING_SOON_PLATFORMS, PLATFORM_NAME } from "@/lib/sales-channels/pure";
import { channelCards } from "@/lib/sales-channels/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET → { data: { cards, soon, saved, listed, skipped } }: Sell everywhere for the phone app, the same as the
// Connect tab of /channels. cards: WhatsApp, Facebook & Instagram, TikTok, Google with what each shows (a platform
// whose app keys aren't set on this server is "soon"); soon: the coming-soon platforms and whether this store
// asked to be told; listed/skipped: products ready to show and products left out (no photo, no price…).
export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first", 404);
  const [{ cards, interest, saved }, health] = await Promise.all([channelCards(store.id), feedHealth(store).catch(() => null)]);
  return ok({
    cards: cards.map((card) => ({ ...card, name: PLATFORM_NAME[card.platform] })),
    soon: COMING_SOON_PLATFORMS.map((platform) => ({ platform, name: PLATFORM_NAME[platform], noted: interest.includes(platform) })),
    saved,
    listed: health?.listed ?? null,
    skipped: health?.skipped.length ?? 0,
  });
});
