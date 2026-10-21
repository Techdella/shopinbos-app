import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { postView } from "@/lib/create/posts.server";
import { POST_PLATFORM_KEYS, cleanPlatforms, postStatusFor, type PostStatus } from "@shared/create-with-rex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One post in the calendar (own posts only).
//   GET → { post } (what the "Time to post" reminder opens)
//   PATCH { status?: "posted", scheduledAt?: ISO | null, caption?, platforms? } → { post }. A new time means a new
//     reminder; no time makes it a draft. "posted" is the person saying they shared it.
//   DELETE → { deleted: true }

const ROLES = ["seller", "supplier", "logistics_partner"] as const;

async function ownPost(userId: string, id: string) {
  return db.scheduledPost.findFirst({ where: { id, userId } });
}

export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const row = await ownPost(user.id, String(params.id ?? ""));
  if (!row) return apiError("NOT_FOUND", "That post wasn't found.", 404);
  return ok({ post: postView(row) });
}, [...ROLES]);

const Patch = z
  .object({
    status: z.literal("posted").optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    caption: z.string().trim().max(2200).optional(),
    platforms: z.array(z.enum(POST_PLATFORM_KEYS)).max(POST_PLATFORM_KEYS.length).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to change.");

export const PATCH = withAuth(async (req: NextRequest, { user, params }) => {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Nothing to change.");
  const row = await ownPost(user.id, String(params.id ?? ""));
  if (!row) return apiError("NOT_FOUND", "That post wasn't found.", 404);
  const input = parsed.data;

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
  const deleted = await db.scheduledPost.deleteMany({ where: { id: String(params.id ?? ""), userId: user.id } });
  if (!deleted.count) return apiError("NOT_FOUND", "That post wasn't found.", 404);
  return ok({ deleted: true });
}, [...ROLES]);
