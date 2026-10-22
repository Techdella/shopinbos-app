import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, noContent, ok } from "@/lib/api/response";
import { PostBody, PostInputError, postView, savePost } from "@/lib/social-posts/save.server";
import { checkPost, publishPost, retryFailed } from "@/lib/social-posts/server";
import { POST_CHANNEL_KEYS, cleanChannels, readResults, statusFromResults } from "@/lib/social-posts/pure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One social post. GET; PATCH: change a draft or scheduled post (same body as POST); DELETE: take it off the
// calendar (nothing is removed from Facebook or Instagram); POST { action }: "now" to post a queued one straight away,
// "retry" the channels that failed, or "shared" when the seller posted it on WhatsApp, TikTok or X themselves.

async function load(userId: string, id: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, slug: true, customDomain: true } });
  if (!store) return null;
  const post = await db.socialPost.findFirst({ where: { id, storeId: store.id } });
  return post ? { store, post } : null;
}

export const GET = withSeller(async (_req, { user, params }) => {
  const found = await load(user.id, String(params.id ?? ""));
  if (!found) return apiError("NOT_FOUND", "Post not found", 404);
  return ok(postView(found.post));
});

export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const found = await load(user.id, String(params.id ?? ""));
  if (!found) return apiError("NOT_FOUND", "Post not found", 404);
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the post and try again");
  try {
    return ok(postView(await savePost({ userId: user.id, store: found.store, id: found.post.id, body: parsed.data })));
  } catch (error) {
    if (error instanceof PostInputError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  const found = await load(user.id, String(params.id ?? ""));
  if (!found) return apiError("NOT_FOUND", "Post not found", 404);
  await db.socialPost.delete({ where: { id: found.post.id } });
  return noContent();
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("now") }),
  z.object({ action: z.literal("check") }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("shared"), channel: z.enum(POST_CHANNEL_KEYS) }),
]);

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const found = await load(user.id, String(params.id ?? ""));
  if (!found) return apiError("NOT_FOUND", "Post not found", 404);
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Unknown action");
  if (parsed.data.action === "check") {
    // The open post page, every few seconds while it's going out: publishes an Instagram reel as soon as it's ready.
    const post = found.post.status === "publishing" ? await checkPost(found.post.id) : found.post;
    return ok(postView(post ?? found.post));
  }
  if (parsed.data.action === "now") {
    // "Post now" on a queued post: it was checked when it was scheduled.
    const claimed = await db.socialPost.updateMany({ where: { id: found.post.id, status: "scheduled" }, data: { status: "publishing", scheduledAt: new Date() } });
    if (claimed.count !== 1) return apiError("BAD_REQUEST", "Only a scheduled post can go out now");
    const post = await publishPost(found.post.id);
    return ok(postView(post ?? found.post));
  }
  if (parsed.data.action === "retry") {
    const post = await retryFailed(found.post.id);
    return ok(post ? postView(post) : postView(found.post));
  }
  const channel = parsed.data.channel;
  const results = readResults(found.post.results);
  if (results[channel]?.status !== "ready" && results[channel]?.status !== "shared") return apiError("BAD_REQUEST", "That one posts by itself");
  results[channel] = { status: "shared", at: new Date().toISOString() };
  const post = await db.socialPost.update({
    where: { id: found.post.id },
    data: { results: results as Prisma.InputJsonValue, status: statusFromResults(cleanChannels(found.post.channels), results) },
  });
  return ok(postView(post));
});
