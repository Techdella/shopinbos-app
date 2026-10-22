import "server-only";

import type { Prisma, SocialPost } from "@prisma/client";
import { db } from "@/lib/db/client";
import { jobView } from "@/lib/create/jobs.server";
import { CREATE_FORMATS, parseDesignId } from "@shared/create-with-rex";
import { cleanChannels, isPostFormat, markShared, readResults, statusAfterShare, type PostChannel } from "./pure";
import { channelsFromPlatforms, formatForDesign, phonePostView, whenFor } from "./phone";
import { PostBody, PostInputError, connectedFor, savePost, type PostBodyInput } from "./save.server";

// A seller's posts calendar in the phone app (src/app/api/mobile/posts/**) is their Social posts calendar: these
// read and write SocialPost through the web's own save and checks (savePost), so a post made on the phone shows in
// Marketing > Social posts and goes out the same way (Facebook and Instagram by themselves, WhatsApp, TikTok and X
// "ready" with a reminder). Suppliers and delivery partners keep src/lib/create/posts.server.ts.

export type SellerStore = { id: string; slug: string; customDomain: string | null };

export function sellerStore(userId: string): Promise<SellerStore | null> {
  return db.store.findUnique({ where: { userId }, select: { id: true, slug: true, customDomain: true } });
}

export async function phoneView(post: SocialPost, connected?: Partial<Record<PostChannel, boolean>>) {
  return phonePostView(post, connected ?? (await connectedFor(post.storeId)));
}

/** Posts planned in the range, plus drafts with no time, as the app's posts. */
export async function listPhonePosts(store: SellerStore, from: Date, to: Date, limit: number) {
  const [rows, connected] = await Promise.all([
    db.socialPost.findMany({
      where: { storeId: store.id, OR: [{ scheduledAt: { gte: from, lte: to } }, { scheduledAt: null, status: "draft" }] },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: limit,
    }),
    connectedFor(store.id),
  ]);
  return rows.map((row) => phonePostView(row, connected));
}

function checked(body: unknown): PostBodyInput {
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) throw new PostInputError(parsed.error.issues[0]?.message ?? "Check the post and try again");
  return parsed.data;
}

/**
 * A new post from the phone: a Create with Rex design (its picture, caption and size, mediaSource "rex") or a
 * picture link, for the picked channels, at the picked time (or a draft).
 */
export async function createFromPhone(input: { userId: string; store: SellerStore; designId?: string; imageUrl?: string | null; caption?: string; platforms: readonly string[]; scheduledAt?: string | null }) {
  const channels = channelsFromPlatforms(input.platforms);
  let mediaUrl = input.imageUrl ?? null;
  let caption = input.caption ?? "";
  let format = formatForDesign(null, channels);
  let mediaSource: PostBodyInput["mediaSource"] = mediaUrl ? "upload" : null;
  if (input.designId) {
    const ref = parseDesignId(input.designId);
    const job = ref ? await db.createJob.findFirst({ where: { id: ref.jobId, userId: input.userId } }) : null;
    const view = job ? jobView(job) : null;
    const design = view?.designs.find((item) => item.id === input.designId);
    if (!view || !design) throw new PostInputError("That design wasn't found.");
    mediaUrl = design.imageUrl;
    caption = caption || design.caption;
    format = formatForDesign(CREATE_FORMATS[view.format], channels);
    mediaSource = "rex";
  }
  const body = checked({ caption, mediaUrl, mediaKind: mediaUrl ? "image" : null, mediaSource, format, fit: "cover", channels, when: whenFor(input.scheduledAt), scheduledAt: input.scheduledAt ?? null });
  return savePost({ userId: input.userId, store: input.store, id: null, body });
}

/** A change from the phone (caption, channels, time; null time makes it a draft), through the web's save. */
export async function editFromPhone(input: { userId: string; store: SellerStore; post: SocialPost; caption?: string; platforms?: readonly string[]; scheduledAt?: string | null }) {
  const { post } = input;
  // Keep a channel the app can't pick (X, made on the web) unless the app sent a new list.
  const channels = input.platforms !== undefined ? channelsFromPlatforms(input.platforms) : cleanChannels(post.channels);
  const scheduledAt = input.scheduledAt !== undefined ? input.scheduledAt : post.status === "scheduled" ? (post.scheduledAt?.toISOString() ?? null) : null;
  const body = checked({
    when: whenFor(scheduledAt),
    scheduledAt,
    caption: input.caption ?? post.caption,
    mediaUrl: post.mediaUrl,
    mediaKind: post.mediaKind,
    mediaSource: post.mediaSource,
    format: isPostFormat(post.format) ? post.format : "square",
    fit: post.fit === "fit" ? "fit" : "cover",
    channels,
    productId: post.productId,
  });
  return savePost({ userId: input.userId, store: input.store, id: post.id, body });
}

/**
 * "Mark as posted" (or Share from Create with Rex): the channel they shared it on, or every WhatsApp, TikTok and X
 * channel still waiting for them. Facebook and Instagram still go out by themselves at the time.
 */
export async function markPostedFromPhone(post: SocialPost, channel: PostChannel | null, now = new Date()) {
  const channels = cleanChannels(post.channels);
  const { results, changed } = markShared(channels, readResults(post.results), channel, now);
  if (!changed.length) throw new PostInputError(channels.some((key) => key === "facebook" || key === "instagram") ? "Facebook and Instagram post this by themselves." : "There's nothing left to post.");
  const status = statusAfterShare(post.status, channels, results);
  const done = status !== "draft" && status !== "scheduled" && status !== "publishing";
  return db.socialPost.update({
    where: { id: post.id },
    // A post shared straight from Create with Rex had no time: it sits on today in both calendars.
    data: { results: results as Prisma.InputJsonValue, status, ...(done && !post.postedAt ? { postedAt: now } : {}), ...(done && !post.scheduledAt ? { scheduledAt: now } : {}) },
  });
}
