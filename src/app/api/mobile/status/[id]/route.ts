import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { removeUnusedImages } from "@/lib/status/status.server";
import { postId, withStatusUser } from "../_shared";

export const dynamic = "force-dynamic";

// DELETE /api/mobile/status/[id]: removes one of my own posts now (with its views and likes, and its photo when no
// other post uses it). Someone else's post, or one already gone, is a 404.
export const DELETE = withStatusUser(async (_req: NextRequest, { user, params }) => {
  const id = postId(params.id);
  if (!id) return apiError("NOT_FOUND", "Post not found", 404);
  const post = await db.statusPost.findFirst({ where: { id, authorId: user.id }, select: { id: true, imageUrl: true } });
  if (!post) return apiError("NOT_FOUND", "Post not found", 404);
  await db.statusPost.deleteMany({ where: { id: post.id, authorId: user.id } });
  await removeUnusedImages([post.imageUrl]).catch(() => 0);
  return ok({ ok: true });
});
