import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { removeFileByPublicUrl } from "@/lib/supabase/storage.server";
import { removeUnusedImages } from "@/lib/status/status.server";
import { postId, withStatusUser } from "../_shared";

export const dynamic = "force-dynamic";

// DELETE /api/mobile/status/[id]: removes one of my own posts now (with its views and likes, its photo when no
// other post uses it, and its video and poster). Someone else's post, or one already gone, is a 404.
export const DELETE = withStatusUser(async (_req: NextRequest, { user, params }) => {
  const id = postId(params.id);
  if (!id) return apiError("NOT_FOUND", "Post not found", 404);
  const post = await db.statusPost.findFirst({ where: { id, authorId: user.id }, select: { id: true, imageUrl: true, videoUrl: true, posterUrl: true } });
  if (!post) return apiError("NOT_FOUND", "Post not found", 404);
  await db.statusPost.deleteMany({ where: { id: post.id, authorId: user.id } });
  await removeUnusedImages([post.imageUrl]).catch(() => 0);
  await Promise.allSettled([post.videoUrl, post.posterUrl].map((url) => removeFileByPublicUrl(url)));
  return ok({ ok: true });
});
