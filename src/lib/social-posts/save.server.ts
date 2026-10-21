import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isOwnImageUrl } from "@/lib/ai/images";
import { productLink } from "@/lib/social/server";
import { POST_CHANNEL_KEYS, POST_FORMAT_KEYS, blockingProblems, cleanChannels, nextQueueSlot, postProblems, type PostChannel } from "./pure";
import { postAccounts, publishPost, renderPostImage } from "./server";

// Creating and changing a social post (POST /api/app/social-posts, PATCH /api/app/social-posts/[id]): checks the
// picture belongs to the seller, prepares it at the post's size, works out when it goes (now, the next queue
// slot, a picked time or a draft) and posts it straight away for "Post now".

export const PostBody = z.object({
  caption: z.string().max(5000).default(""),
  mediaUrl: z.string().url().max(2000).nullable().optional(),
  mediaKind: z.enum(["image", "video"]).nullable().optional(),
  mediaSource: z.enum(["rex", "reel", "library", "product", "upload"]).nullable().optional(),
  format: z.enum(POST_FORMAT_KEYS).default("square"),
  fit: z.enum(["cover", "fit"]).default("cover"),
  channels: z.array(z.enum(POST_CHANNEL_KEYS)).max(POST_CHANNEL_KEYS.length).default([]),
  productId: z.string().max(64).nullable().optional(),
  /** now: post straight away; queue: the next free queue time; schedule: scheduledAt; draft: keep it for later. */
  when: z.enum(["now", "queue", "schedule", "draft"]),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export type PostBodyInput = z.infer<typeof PostBody>;

export class PostInputError extends Error {}

type Store = { id: string; slug: string; customDomain: string | null };

/** The picture or video must be the seller's: our storage, their media library or one of their product photos. */
async function mediaAllowed(userId: string, storeId: string, url: string) {
  if (isOwnImageUrl(url)) return true;
  const [asset, product] = await Promise.all([
    db.mediaAsset.findFirst({ where: { userId, url }, select: { id: true } }),
    db.storeProduct.findFirst({ where: { storeId, images: { has: url } }, select: { id: true } }),
  ]);
  return Boolean(asset || product);
}

export async function connectedFor(storeId: string): Promise<Partial<Record<PostChannel, boolean>>> {
  const accounts = await postAccounts(storeId);
  return { facebook: Boolean(accounts.facebook), instagram: Boolean(accounts.instagram) };
}

/** Saves a new post (id null) or changes one that hasn't gone out yet, then posts it if it's for now. */
export async function savePost(input: { userId: string; store: Store; id: string | null; body: PostBodyInput; now?: Date }) {
  const now = input.now ?? new Date();
  const { body, store } = input;
  const channels = cleanChannels(body.channels);
  const existing = input.id ? await db.socialPost.findFirst({ where: { id: input.id, storeId: store.id } }) : null;
  if (input.id && !existing) throw new PostInputError("That post isn't in your shop");
  if (existing && !["draft", "scheduled"].includes(existing.status)) throw new PostInputError("This post has gone out already. Use it again to make a new one.");

  const mediaUrl = body.mediaUrl ?? null;
  if (mediaUrl && !(await mediaAllowed(input.userId, store.id, mediaUrl))) throw new PostInputError("Pick a picture from your Rex designs, media library or products");
  const mediaKind = mediaUrl ? (body.mediaKind ?? "image") : null;

  let link: string | null = null;
  let productId: string | null = null;
  if (body.productId) {
    const product = await db.storeProduct.findFirst({ where: { id: body.productId, storeId: store.id }, select: { id: true } });
    if (!product) throw new PostInputError("That product isn't in your shop");
    productId = product.id;
    link = productLink(store, product.id);
  }

  if (body.when !== "draft") {
    if (!channels.length) throw new PostInputError("Pick at least one place to post");
    if (!body.caption.trim() && !mediaUrl) throw new PostInputError("Add a picture or write a caption");
    const blocking = blockingProblems(postProblems({ channels, caption: body.caption, format: body.format, mediaUrl, mediaKind, linkLength: link ? link.length + 40 : 0 }, await connectedFor(store.id)));
    const first = blocking[0];
    if (first) {
      const messages: Record<string, string> = {
        needs_media: "needs a picture or video",
        too_long: "caption is too long",
        video_type: "needs an MP4 video (save the reel again as MP4)",
        not_connected: "isn't connected yet. Connect it under Accounts",
      };
      throw new PostInputError(`${first.channel === "x" ? "X" : first.channel[0].toUpperCase() + first.channel.slice(1)} ${messages[first.kind] ?? "can't take this post"}`);
    }
  }

  let scheduledAt: Date | null = null;
  if (body.when === "now") scheduledAt = now;
  if (body.when === "schedule") {
    scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) throw new PostInputError("Pick a day and time");
    if (scheduledAt.getTime() < now.getTime() - 60 * 1000) throw new PostInputError("That time has passed. Pick a later one or post now.");
    if (scheduledAt.getTime() > now.getTime() + 365 * 24 * 60 * 60 * 1000) throw new PostInputError("Pick a time within the next year");
  }
  if (body.when === "queue") {
    const taken = await db.socialPost.findMany({ where: { storeId: store.id, status: "scheduled", scheduledAt: { gte: now }, ...(existing ? { id: { not: existing.id } } : {}) }, select: { scheduledAt: true }, take: 500 });
    scheduledAt = nextQueueSlot(taken.map((row) => row.scheduledAt!).filter(Boolean), now);
  }
  if (body.when === "draft") scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : (existing?.scheduledAt ?? null);

  // The picture at the post's size, made again only when the picture, size or fit changed.
  let renderedUrl = existing?.renderedUrl ?? null;
  const sameRender = existing && existing.mediaUrl === mediaUrl && existing.format === body.format && existing.fit === body.fit;
  if (!sameRender) renderedUrl = mediaUrl && mediaKind === "image" ? await renderPostImage({ storeId: store.id, url: mediaUrl, format: body.format, fit: body.fit }) : null;

  const data = {
    caption: body.caption.trim(),
    mediaUrl,
    mediaKind,
    renderedUrl,
    mediaSource: mediaUrl ? (body.mediaSource ?? null) : null,
    format: body.format,
    fit: body.fit,
    channels,
    productId,
    link,
    scheduledAt,
    status: body.when === "draft" ? "draft" : body.when === "now" ? "publishing" : "scheduled",
    results: {} as Prisma.InputJsonValue,
  };
  const saved = existing
    ? await db.socialPost.update({ where: { id: existing.id }, data })
    : await db.socialPost.create({ data: { ...data, storeId: store.id, userId: input.userId } });
  if (body.when === "now") return (await publishPost(saved.id, now)) ?? saved;
  return saved;
}

/** What the page and the phone app get for a post. */
export function postView(post: { id: string; caption: string; mediaUrl: string | null; mediaKind: string | null; renderedUrl: string | null; mediaSource: string | null; format: string; fit: string; channels: string[]; productId: string | null; link: string | null; status: string; scheduledAt: Date | null; postedAt: Date | null; results: Prisma.JsonValue; createdAt: Date; updatedAt: Date }) {
  return {
    id: post.id,
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    mediaKind: post.mediaKind,
    renderedUrl: post.renderedUrl,
    mediaSource: post.mediaSource,
    format: post.format,
    fit: post.fit,
    channels: cleanChannels(post.channels),
    productId: post.productId,
    link: post.link,
    status: post.status,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    postedAt: post.postedAt?.toISOString() ?? null,
    results: post.results,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}
