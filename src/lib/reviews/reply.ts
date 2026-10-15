import "server-only";
import { db } from "@/lib/db/client";
import { getGoogleConnection, replyOnGoogle } from "./google";

// Saving the seller's public reply under a review, for the review page (src/app/actions/reviews.ts) and Peggy's
// reviews_reply tool. Store reviews show it on the store; Google reviews imported through the API also get it on
// Google when connected. An empty reply deletes it. Only reviews of this store are touched.

export interface ReplyOutcome {
  ok: boolean;
  message: string;
}

export async function saveSellerReply(storeId: string, ref: { kind: "store" | "external"; id: string }, text: string): Promise<ReplyOutcome> {
  const reply = text.trim().slice(0, 4000);
  const now = new Date();
  if (ref.kind === "store") {
    const res = await db.productReview.updateMany({ where: { id: ref.id, storeId }, data: { sellerReply: reply, repliedAt: reply ? now : null } });
    return res.count ? { ok: true, message: reply ? "Reply saved. It shows under the review on your store." : "Reply deleted." } : { ok: false, message: "Review not found." };
  }
  const review = await db.externalReview.findFirst({ where: { id: ref.id, storeId } });
  if (!review) return { ok: false, message: "Review not found." };
  let synced: Date | null = null;
  let replyError: string | null = null;
  if (review.source === "google" && review.importMethod === "api" && review.externalId) {
    const connection = await getGoogleConnection(storeId);
    if (connection) {
      try {
        await replyOnGoogle(storeId, review.externalId, reply);
        synced = now;
      } catch (error) {
        replyError = error instanceof Error ? error.message.slice(0, 300) : "Google didn't accept the reply";
      }
    } else replyError = "Google isn't connected, so the reply is only saved here.";
  }
  await db.externalReview.update({ where: { id: review.id }, data: { reply: reply || null, repliedAt: reply ? now : null, replySyncedAt: synced, replyError } });
  if (replyError) return { ok: false, message: `Saved here, but not on Google: ${replyError}` };
  if (synced) return { ok: true, message: reply ? "Reply posted on Google and saved." : "Reply deleted on Google." };
  return { ok: true, message: reply ? "Reply saved. It shows with the review on your reviews wall." : "Reply deleted." };
}
