import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created, okList } from "@/lib/api/response";
import { PostBody, PostInputError, postView, savePost } from "@/lib/social-posts/save.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Social posts (Marketing > Social posts). GET ?from=&to= (ISO): the posts planned or posted in that window (or the
// latest 100). POST: a new post ({ caption, mediaUrl, format, fit, channels, productId, when, scheduledAt }).

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const from = new Date(req.nextUrl.searchParams.get("from") ?? "");
  const to = new Date(req.nextUrl.searchParams.get("to") ?? "");
  const range = !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) ? { scheduledAt: { gte: from, lt: to } } : {};
  const posts = await db.socialPost.findMany({ where: { storeId: store.id, ...range }, orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }], take: 100 });
  return okList(posts.map(postView), { page: 1, limit: 100, total: posts.length });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true, customDomain: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your shop first", 404);
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the post and try again");
  try {
    const post = await savePost({ userId: user.id, store, id: null, body: parsed.data });
    return created(postView(post));
  } catch (error) {
    if (error instanceof PostInputError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
