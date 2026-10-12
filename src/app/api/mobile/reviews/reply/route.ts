import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { getGoogleConnection, replyOnGoogle } from "@/lib/reviews/google";
import { parseReviewKey } from "@/lib/reviews/pure";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { key, reply } → { data: { message, google } }: the mobile app's public reply to a review, the same as the
// web's saveReviewReply action. An empty reply deletes it. Replies to reviews imported from Google are posted
// on Google too when Google is connected.

const Body = z.object({ key: z.string().max(80), reply: z.string().max(4000) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const ref = parsed.success ? parseReviewKey(parsed.data.key) : null;
  if (!parsed.success || !ref) return apiError("BAD_REQUEST", "Review not found.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const reply = parsed.data.reply.trim();
  const now = new Date();

  if (ref.kind === "store") {
    const res = await db.productReview.updateMany({ where: { id: ref.id, storeId: store.id }, data: { sellerReply: reply, repliedAt: reply ? now : null } });
    if (!res.count) return apiError("NOT_FOUND", "Review not found.", 404);
    return ok({ message: reply ? "Reply saved. It shows under the review on your store." : "Reply deleted.", google: null });
  }

  const review = await db.externalReview.findFirst({ where: { id: ref.id, storeId: store.id } });
  if (!review) return apiError("NOT_FOUND", "Review not found.", 404);
  let synced: Date | null = null;
  let replyError: string | null = null;
  if (review.source === "google" && review.importMethod === "api" && review.externalId) {
    const connection = await getGoogleConnection(store.id);
    if (connection) {
      try {
        await replyOnGoogle(store.id, review.externalId, reply);
        synced = now;
      } catch (error) {
        replyError = error instanceof Error ? error.message.slice(0, 300) : "Google didn't accept the reply";
      }
    } else replyError = "Google isn't connected, so the reply is only saved here.";
  }
  await db.externalReview.update({ where: { id: review.id }, data: { reply: reply || null, repliedAt: reply ? now : null, replySyncedAt: synced, replyError } });
  if (replyError) return ok({ message: `Saved here, but not on Google: ${replyError}`, google: "failed" });
  if (synced) return ok({ message: reply ? "Reply posted on Google and saved." : "Reply deleted on Google.", google: "synced" });
  return ok({ message: reply ? "Reply saved. It shows with the review on your reviews wall." : "Reply deleted.", google: null });
});
