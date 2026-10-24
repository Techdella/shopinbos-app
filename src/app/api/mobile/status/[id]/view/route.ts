import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { livePost, viewerCanSee } from "@/lib/status/status.server";
import { updateShopinbos } from "@/lib/status/shopinbos.server";
import { parseShopinbosPostId } from "@shared/shopinbos-status";
import { postId, withStatusUser } from "../../_shared";

export const dynamic = "force-dynamic";

// POST /api/mobile/status/[id]/view → { ok: true }: I saw this post (counted once per viewer; my own views don't
// count). Only a live post I'm allowed to see; anything else is a 404.
// Shopinbos's own posts (sib-<role>-<key>, shared/shopinbos-status.ts) are kept as seen on the account instead.
export const POST = withStatusUser(async (_req: NextRequest, { user, params }) => {
  const official = parseShopinbosPostId(params.id);
  if (official) {
    if (official.role !== user.role) return apiError("NOT_FOUND", "This post has ended.", 404);
    if (!checkRateLimit(`status-view:${user.id}`, { maxRequests: 300, windowMs: 60_000 }).allowed) return apiError("RATE_LIMITED", "Slow down a little.", 429);
    await updateShopinbos(user.id, { seen: [String(params.id)] });
    return ok({ ok: true });
  }
  const id = postId(params.id);
  const post = id ? await livePost(id) : null;
  if (!post) return apiError("NOT_FOUND", "This post has ended.", 404);
  if (post.authorId === user.id) return ok({ ok: true });
  if (!checkRateLimit(`status-view:${user.id}`, { maxRequests: 300, windowMs: 60_000 }).allowed) return apiError("RATE_LIMITED", "Slow down a little.", 429);
  if (!(await viewerCanSee({ id: user.id, role: user.role }, { id: post.authorId, role: post.role }))) return apiError("NOT_FOUND", "This post has ended.", 404);
  await db.statusView.createMany({ data: [{ postId: post.id, viewerId: user.id }], skipDuplicates: true });
  return ok({ ok: true });
});
