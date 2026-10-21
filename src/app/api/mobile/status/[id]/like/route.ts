import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { livePost, viewerCanSee } from "@/lib/status/status.server";
import { postId, withStatusUser } from "../../_shared";

export const dynamic = "force-dynamic";

// POST /api/mobile/status/[id]/like { like: boolean } → { likes, liked }: like or unlike a live post I can see
// (once per user; liking twice is the same as once).
const Body = z.object({ like: z.boolean() });

export const POST = withStatusUser(async (req: NextRequest, { user, params }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say whether you like it.");
  const id = postId(params.id);
  const post = id ? await livePost(id) : null;
  if (!post) return apiError("NOT_FOUND", "This post has ended.", 404);
  if (!checkRateLimit(`status-like:${user.id}`, { maxRequests: 120, windowMs: 60_000 }).allowed) return apiError("RATE_LIMITED", "Slow down a little.", 429);
  if (post.authorId !== user.id && !(await viewerCanSee({ id: user.id, role: user.role }, { id: post.authorId, role: post.role }))) {
    return apiError("NOT_FOUND", "This post has ended.", 404);
  }
  if (parsed.data.like) await db.statusLike.createMany({ data: [{ postId: post.id, userId: user.id }], skipDuplicates: true });
  else await db.statusLike.deleteMany({ where: { postId: post.id, userId: user.id } });
  const [likes, mine] = await Promise.all([
    db.statusLike.count({ where: { postId: post.id } }),
    db.statusLike.count({ where: { postId: post.id, userId: user.id } }),
  ]);
  return ok({ likes, liked: mine > 0 });
});
