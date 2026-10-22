import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { postView } from "@/lib/create/posts.server";
import { PostInputError } from "@/lib/social-posts/save.server";
import { editFromPhone, markPostedFromPhone, phoneView, sellerStore } from "@/lib/social-posts/phone.server";
import { POST_CHANNEL_KEYS } from "@/lib/social-posts/pure";
import { cleanPlatforms, postStatusFor, postsCalendarFor, type PostStatus } from "@shared/create-with-rex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One post in the calendar (own posts only; a seller's are their Social posts, by store).
//   GET → { post } (what the reminder opens: "Time to post", or a seller's "Your post is ready for WhatsApp")
//   PATCH { status?: "posted", channel?, scheduledAt?: ISO | null, caption?, platforms? } → { post }. A new time means
//     a new reminder (a seller's goes through the web's scheduling); no time makes it a draft. "posted" is the person
//     saying they shared it: for a seller, on `channel`, or on every WhatsApp, TikTok and X channel still waiting.
//   DELETE → { deleted: true }

const ROLES = ["seller", "supplier", "logistics_partner"] as const;

async function ownPost(userId: string, id: string) {
  return db.scheduledPost.findFirst({ where: { id, userId } });
}

async function ownSocialPost(userId: string, id: string) {
  const store = await sellerStore(userId);
  const post = store ? await db.socialPost.findFirst({ where: { id, storeId: store.id } }) : null;
  return store && post ? { store, post } : null;
}

export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const id = String(params.id ?? "");
  if (postsCalendarFor(user.role) === "social") {
    const found = await ownSocialPost(user.id, id);
    if (!found) return apiError("NOT_FOUND", "That post wasn't found.", 404);
    return ok({ post: await phoneView(found.post) });
  }
  const row = await ownPost(user.id, id);
  if (!row) return apiError("NOT_FOUND", "That post wasn't found.", 404);
  return ok({ post: postView(row) });
}, [...ROLES]);

const Patch = z
  .object({
    status: z.literal("posted").optional(),
    channel: z.enum(POST_CHANNEL_KEYS).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    caption: z.string().trim().max(2200).optional(),
    platforms: z.array(z.string().trim().max(20)).max(10).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to change.");

export const PATCH = withAuth(async (req: NextRequest, { user, params }) => {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Nothing to change.");
  const input = parsed.data;
  const id = String(params.id ?? "");

  if (postsCalendarFor(user.role) === "social") {
    const found = await ownSocialPost(user.id, id);
    if (!found) return apiError("NOT_FOUND", "That post wasn't found.", 404);
    try {
      const post =
        input.status === "posted"
          ? await markPostedFromPhone(found.post, input.channel ?? null)
          : await editFromPhone({ userId: user.id, store: found.store, post: found.post, caption: input.caption, platforms: input.platforms, scheduledAt: input.scheduledAt });
      return ok({ post: await phoneView(post) });
    } catch (error) {
      if (error instanceof PostInputError) return apiError("BAD_REQUEST", error.message);
      throw error;
    }
  }

  const row = await ownPost(user.id, id);
  if (!row) return apiError("NOT_FOUND", "That post wasn't found.", 404);
  const timeChanged = input.scheduledAt !== undefined;
  const scheduledAt = timeChanged ? (input.scheduledAt ? new Date(input.scheduledAt) : null) : row.scheduledAt;
  if (timeChanged && scheduledAt && scheduledAt.getTime() < Date.now() - 5 * 60_000 && input.status !== "posted") {
    return apiError("BAD_REQUEST", "Pick a time that hasn't passed.");
  }
  const markPosted = input.status === "posted";
  const status = postStatusFor({ current: row.status as PostStatus, scheduledAt, markPosted });

  const updated = await db.scheduledPost.update({
    where: { id: row.id },
    data: {
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.platforms !== undefined ? { platforms: cleanPlatforms(input.platforms) } : {}),
      ...(timeChanged ? { scheduledAt, remindedAt: null } : {}),
      status,
      ...(markPosted && !row.postedAt ? { postedAt: new Date() } : {}),
    },
  });
  return ok({ post: postView(updated) });
}, [...ROLES]);

export const DELETE = withAuth(async (_req: NextRequest, { user, params }) => {
  const id = String(params.id ?? "");
  if (postsCalendarFor(user.role) === "social") {
    // Takes it off the calendar (nothing is removed from Facebook or Instagram), like the web.
    const found = await ownSocialPost(user.id, id);
    if (!found) return apiError("NOT_FOUND", "That post wasn't found.", 404);
    await db.socialPost.delete({ where: { id: found.post.id } });
    return ok({ deleted: true });
  }
  const deleted = await db.scheduledPost.deleteMany({ where: { id, userId: user.id } });
  if (!deleted.count) return apiError("NOT_FOUND", "That post wasn't found.", 404);
  return ok({ deleted: true });
}, [...ROLES]);
