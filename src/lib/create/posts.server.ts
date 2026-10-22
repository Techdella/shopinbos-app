import "server-only";

import type { ScheduledPost } from "@prisma/client";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { connectedFor } from "@/lib/social-posts/save.server";
import { dueReminders, postAccounts, postLink, postsCalendarFor, reminderText, REMINDER_MAX_LATE_MS, type PostStatus } from "@shared/create-with-rex";

// The posts calendar of suppliers and delivery partners (src/app/api/mobile/posts/**) and its reminders
// (src/app/api/cron/post-reminders). Nothing is posted for them: at the time, they get "Time to post: …" (push +
// bell), which opens the post with Share. A seller's calendar is their Social posts (src/lib/social-posts/phone.server.ts),
// whose "ready" notification is their reminder.

export function postView(row: Pick<ScheduledPost, "id" | "imageUrl" | "caption" | "platforms" | "status" | "scheduledAt" | "postedAt">) {
  return {
    id: row.id,
    imageUrl: row.imageUrl,
    caption: row.caption,
    platforms: row.platforms,
    status: (row.status === "posted" || row.status === "scheduled" ? row.status : "draft") as PostStatus,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    postedAt: row.postedAt?.toISOString() ?? null,
  };
}

/**
 * WhatsApp, Instagram, Facebook and TikTok. For a seller, Facebook and Instagram are linked (and post by themselves)
 * when the Page is connected on Social posts; WhatsApp and TikTok when the store has that sales channel connected.
 */
export async function accountsFor(user: { id: string; role: string }) {
  if (postsCalendarFor(user.role) !== "social") return postAccounts([]);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } }).catch(() => null);
  if (!store) return postAccounts([], { facebook: false, instagram: false });
  const [connections, social] = await Promise.all([
    db.socialChannelConnection.findMany({ where: { storeId: store.id }, select: { channel: true, status: true, tokenEnc: true } }).catch(() => []),
    connectedFor(store.id).catch(() => ({ facebook: false, instagram: false })),
  ]);
  return postAccounts(
    connections.map((row) => ({ channel: row.channel, status: row.status, tokenEnc: Boolean(row.tokenEnc) })),
    { facebook: social.facebook === true, instagram: social.instagram === true },
  );
}

/** Sends every due reminder once (claimed by setting remindedAt first, so two runs never send it twice). */
export async function sendPostReminders(now = new Date(), limit = 300) {
  const rows = await db.scheduledPost.findMany({
    where: { status: "scheduled", remindedAt: null, scheduledAt: { lte: now, gte: new Date(now.getTime() - REMINDER_MAX_LATE_MS) } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true, userId: true, caption: true, imageUrl: true, status: true, scheduledAt: true, remindedAt: true },
  });
  let sent = 0;
  for (const post of dueReminders(rows, now)) {
    const claimed = await db.scheduledPost.updateMany({ where: { id: post.id, remindedAt: null, status: "scheduled" }, data: { remindedAt: now } });
    if (claimed.count !== 1) continue;
    try {
      await notify({
        userId: post.userId,
        category: "marketing",
        type: "marketing",
        priority: "info",
        title: reminderText(post.caption),
        description: "Your design and caption are ready. Open it and tap Share.",
        link: postLink(post.id),
        imageUrl: post.imageUrl,
        dedupeKey: `post-reminder:${post.id}`,
        // They chose this time themselves, so quiet hours don't hold it.
        urgent: true,
        metadata: { postId: post.id },
      });
      sent += 1;
    } catch (error) {
      console.error("[posts] reminder failed", post.id, error);
      // Nothing went out: let the next run try again (the dedupe key still stops a second copy).
      await db.scheduledPost.updateMany({ where: { id: post.id, remindedAt: now }, data: { remindedAt: null } }).catch(() => undefined);
    }
  }
  return { due: rows.length, sent };
}
