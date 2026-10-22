import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { decryptJson } from "@/lib/inbox/crypto";
import { graph } from "@/lib/whatsapp-catalog/graph";
import { uploadPublicFileAt } from "@/lib/supabase/storage.server";
import { isOwnImageUrl } from "@/lib/ai/images";
import { notify } from "@/lib/notifications/notify.server";
import { postText, taggedProductLink } from "@/lib/social/share";
import {
  POST_FORMATS,
  channelSpec,
  cleanChannels,
  instagramKind,
  isPostFormat,
  readResults,
  readyToShare,
  statusFromResults,
  type ChannelResult,
  type MediaKind,
  type PostChannel,
  type PostFormat,
  type PostResults,
} from "./pure";

// Social posts: prepares the picture at the post's size, posts to the Facebook Page and Instagram account the
// seller connected (Social posts → Accounts, one Facebook sign-in), and marks WhatsApp, TikTok and X "ready" for
// the seller's one tap. /api/cron/social-posts runs the due ones every 5 minutes. Tokens never leave the server.

// ─── Accounts ───────────────────────────────────────────────────────────────

export interface PostAccounts {
  facebook: { pageId: string; name: string; token: string } | null;
  instagram: { accountId: string; name: string; token: string } | null;
}

/** The Facebook Page and Instagram account connected through "Connect Facebook & Instagram" (the inbox rows). */
export async function postAccounts(storeId: string): Promise<PostAccounts> {
  const rows = await db.inboxChannel
    .findMany({ where: { storeId, channel: { in: ["messenger", "instagram"] }, status: "connected" }, select: { channel: true, externalId: true, displayName: true, credentials: true } })
    .catch(() => []);
  const accounts: PostAccounts = { facebook: null, instagram: null };
  for (const row of rows) {
    const creds = decryptJson<{ pageAccessToken?: string; pageId?: string }>(row.credentials);
    if (!creds?.pageAccessToken) continue;
    if (row.channel === "messenger" && (creds.pageId || row.externalId)) accounts.facebook = { pageId: creds.pageId ?? row.externalId!, name: row.displayName ?? "Facebook Page", token: creds.pageAccessToken };
    if (row.channel === "instagram" && row.externalId) accounts.instagram = { accountId: row.externalId, name: row.displayName ?? "Instagram", token: creds.pageAccessToken };
  }
  return accounts;
}

/** Names only, for the page (never the tokens). */
export async function postAccountNames(storeId: string) {
  const accounts = await postAccounts(storeId);
  return { facebook: accounts.facebook?.name ?? null, instagram: accounts.instagram?.name ?? null };
}

// ─── The picture at the post's size ─────────────────────────────────────────

type Sharp = (typeof import("sharp"))["default"];

async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch (error) {
    console.warn("[social-posts] sharp unavailable, posting the original picture", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * The picture as a JPEG at the post's size (Instagram only takes JPEG; Rex saves WebP): "cover" crops to fill,
 * keeping the interesting part; "fit" shows the whole picture on a blurred copy of itself. Only our own storage is
 * fetched. Null when it can't be made (the original is posted then).
 */
export async function renderPostImage(input: { storeId: string; url: string; format: PostFormat; fit: "cover" | "fit" }): Promise<string | null> {
  if (!isOwnImageUrl(input.url)) return null;
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const response = await fetch(input.url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return null;
    const source = Buffer.from(await response.arrayBuffer());
    if (source.byteLength > 25 * 1024 * 1024) return null;
    const { width, height } = POST_FORMATS[input.format];
    let output: Buffer;
    if (input.fit === "fit") {
      const backdrop = await sharp(source).rotate().resize(width, height, { fit: "cover" }).blur(40).modulate({ brightness: 0.85 }).toBuffer();
      const front = await sharp(source).rotate().resize(width, height, { fit: "inside" }).toBuffer();
      output = await sharp(backdrop).composite([{ input: front, gravity: "center" }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    } else {
      output = await sharp(source).rotate().resize(width, height, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    }
    const stored = await uploadPublicFileAt(`social/${input.storeId}/${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 16)}.jpg`, new Blob([new Uint8Array(output)], { type: "image/jpeg" }));
    return stored.publicUrl;
  } catch (error) {
    console.error("[social-posts] render failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return null;
  }
}

// ─── Posting ────────────────────────────────────────────────────────────────

interface PostRow {
  id: string;
  storeId: string;
  userId: string;
  caption: string;
  mediaUrl: string | null;
  mediaKind: string | null;
  renderedUrl: string | null;
  format: string;
  channels: string[];
  link: string | null;
  results: Prisma.JsonValue;
}

/** The product link tagged for the channel, so visits and orders from the post show under it in Analytics. */
export function channelLink(channel: PostChannel, link: string | null) {
  return link ? taggedProductLink(link, channel, "social_post") : null;
}

export function captionFor(channel: PostChannel, post: { caption: string; link: string | null }) {
  const link = channelLink(channel, post.link);
  if (!link) return post.caption.trim().slice(0, channelSpec(channel).limit);
  return postText(channel, post.caption, link);
}

function failure(error: { kind: string; message: string }, now: Date): ChannelResult {
  const reconnect = error.kind === "token" || error.kind === "permission";
  return { status: "failed", at: now.toISOString(), error: reconnect ? "Facebook needs you to connect again to allow posting." : error.message.slice(0, 300), ...(reconnect ? { reconnect: true } : {}) };
}

async function postToFacebook(account: NonNullable<PostAccounts["facebook"]>, post: PostRow, media: { url: string; kind: MediaKind } | null, now: Date): Promise<ChannelResult> {
  const message = captionFor("facebook", post);
  const page = encodeURIComponent(account.pageId);
  const result = !media
    ? await graph(`${page}/feed`, account.token, { body: { message: post.caption.trim(), ...(post.link ? { link: channelLink("facebook", post.link) } : {}) } })
    : media.kind === "video"
      ? await graph(`${page}/videos`, account.token, { body: { file_url: media.url, description: message }, timeoutMs: 120_000 })
      : await graph(`${page}/photos`, account.token, { body: { url: media.url, message } });
  if (!result.ok) return failure(result.error, now);
  const id = typeof result.json.post_id === "string" ? result.json.post_id : typeof result.json.id === "string" ? result.json.id : undefined;
  return { status: "posted", at: now.toISOString(), ...(id ? { id, url: `https://www.facebook.com/${id}` } : {}) };
}

/** `since`: when Instagram started processing (kept across checks, for the progress timer on the post page). */
async function publishInstagram(account: NonNullable<PostAccounts["instagram"]>, container: string, now: Date, since = now.toISOString()): Promise<ChannelResult> {
  const status = await graph(encodeURIComponent(container), account.token, { query: { fields: "status_code" } });
  const code = status.ok ? status.json.status_code : null;
  if (code === "IN_PROGRESS") return { status: "waiting", container, at: now.toISOString(), since };
  if (code === "ERROR" || code === "EXPIRED") return { status: "failed", at: now.toISOString(), error: "Instagram couldn't use this picture or video. Try a different one." };
  const published = await graph(`${encodeURIComponent(account.accountId)}/media_publish`, account.token, { body: { creation_id: container } });
  if (!published.ok) {
    // 9007: the media isn't ready yet; try again on the next run.
    if (published.error.code === 9007) return { status: "waiting", container, at: now.toISOString(), since };
    return failure(published.error, now);
  }
  const id = typeof published.json.id === "string" ? published.json.id : undefined;
  let url: string | undefined;
  if (id) {
    const info = await graph(encodeURIComponent(id), account.token, { query: { fields: "permalink" } });
    if (info.ok && typeof info.json.permalink === "string") url = info.json.permalink;
  }
  return { status: "posted", at: now.toISOString(), ...(id ? { id } : {}), ...(url ? { url } : {}) };
}

async function postToInstagram(account: NonNullable<PostAccounts["instagram"]>, post: PostRow, media: { url: string; kind: MediaKind } | null, previous: ChannelResult | undefined, now: Date): Promise<ChannelResult> {
  if (previous?.status === "waiting") return publishInstagram(account, previous.container, now, previous.since ?? previous.at);
  if (!media) return { status: "failed", at: now.toISOString(), error: "Instagram needs a picture or video." };
  const kind = instagramKind(isPostFormat(post.format) ? post.format : "square", media.kind);
  const body: Record<string, unknown> =
    kind === "reel"
      ? { media_type: "REELS", video_url: media.url, caption: captionFor("instagram", post), share_to_feed: true }
      : kind === "story"
        ? { media_type: "STORIES", image_url: media.url }
        : { image_url: media.url, caption: captionFor("instagram", post) };
  const created = await graph(`${encodeURIComponent(account.accountId)}/media`, account.token, { body, timeoutMs: 60_000 });
  if (!created.ok) return failure(created.error, now);
  const container = typeof created.json.id === "string" ? created.json.id : null;
  if (!container) return { status: "failed", at: now.toISOString(), error: "Instagram didn't accept the post. Try again." };
  // Pictures are ready at once; a reel takes a minute or so. The open post page checks every few seconds
  // (checkPost); the cron publishes it otherwise.
  if (kind === "reel") return { status: "waiting", container, at: now.toISOString(), since: now.toISOString() };
  return publishInstagram(account, container, now);
}

/**
 * Posts one post to every channel that doesn't have a result yet (or is waiting on Instagram), saves the results
 * and the status, and tells the seller what's ready for their tap. Never throws for a channel's failure.
 */
export async function publishPost(postId: string, now = new Date()) {
  const post = await db.socialPost.findUnique({ where: { id: postId } });
  if (!post) return null;
  const channels = cleanChannels(post.channels);
  const results: PostResults = readResults(post.results);
  const media = post.mediaUrl ? { url: post.renderedUrl ?? post.mediaUrl, kind: (post.mediaKind === "video" ? "video" : "image") as MediaKind } : null;
  const needsAccounts = channels.some((channel) => channelSpec(channel).auto && (!results[channel] || results[channel]!.status === "waiting"));
  const accounts = needsAccounts ? await postAccounts(post.storeId) : { facebook: null, instagram: null };

  for (const channel of channels) {
    const previous = results[channel];
    if (previous && previous.status !== "waiting") continue;
    if (!channelSpec(channel).auto) {
      results[channel] = { status: "ready", at: now.toISOString() };
      continue;
    }
    try {
      if (channel === "facebook") {
        results.facebook = accounts.facebook ? await postToFacebook(accounts.facebook, post, media, now) : { status: "failed", at: now.toISOString(), error: "Connect your Facebook Page first.", reconnect: true };
      } else if (channel === "instagram") {
        results.instagram = accounts.instagram ? await postToInstagram(accounts.instagram, post, media, previous, now) : { status: "failed", at: now.toISOString(), error: "Connect your Instagram account first.", reconnect: true };
      }
    } catch (error) {
      console.error(`[social-posts] ${channel} failed`, error instanceof Error ? error.message.slice(0, 200) : "unknown");
      results[channel] = { status: "failed", at: now.toISOString(), error: "Something went wrong. Try again." };
    }
  }

  // An Instagram video still processing after an hour isn't coming.
  for (const channel of channels) {
    const item = results[channel];
    if (item?.status === "waiting" && post.scheduledAt && now.getTime() - post.scheduledAt.getTime() > 60 * 60 * 1000) {
      results[channel] = { status: "failed", at: now.toISOString(), error: "Instagram took too long with this video. Try again." };
    }
  }

  const status = statusFromResults(channels, results);
  const done = status !== "publishing";
  const updated = await db.socialPost.update({
    where: { id: post.id },
    data: { results: results as Prisma.InputJsonValue, status, ...(done && !post.postedAt ? { postedAt: now } : {}) },
  });

  const wasReady = readyToShare(channels, readResults(post.results));
  const ready = readyToShare(channels, results).filter((channel) => !wasReady.includes(channel));
  if (ready.length) {
    const names = ready.map((channel) => channelSpec(channel).label).join(", ");
    await notify({
      userId: post.userId,
      category: "marketing",
      title: `Your post is ready for ${names}`,
      description: "Tap to post it. The caption is copied and the picture is ready.",
      link: `/home/marketing/social/${post.id}`,
      actionLabel: "Post it",
      actionUrl: `/home/marketing/social/${post.id}`,
      imageUrl: post.renderedUrl ?? (post.mediaKind === "image" ? post.mediaUrl : null),
      dedupeKey: `social-post-ready:${post.id}:${ready.join(",")}`,
    }).catch((error) => console.error("[social-posts] notify failed", error instanceof Error ? error.message : error));
  }
  const failed = channels.filter((channel) => results[channel]?.status === "failed" && readResults(post.results)[channel]?.status !== "failed");
  if (failed.length) {
    await notify({
      userId: post.userId,
      category: "marketing",
      title: `Your post didn't go out on ${failed.map((channel) => channelSpec(channel).label).join(", ")}`,
      description: "Open it to see why and try again.",
      link: `/home/marketing/social/${post.id}`,
      dedupeKey: `social-post-failed:${post.id}:${failed.join(",")}`,
    }).catch(() => undefined);
  }
  return updated;
}

/** "Try again" on failed channels: clears their results so the next publish posts them again. */
export async function retryFailed(postId: string, now = new Date()) {
  const post = await db.socialPost.findUnique({ where: { id: postId }, select: { results: true } });
  if (!post) return null;
  const results = readResults(post.results);
  for (const key of Object.keys(results) as PostChannel[]) if (results[key]?.status === "failed") delete results[key];
  await db.socialPost.update({ where: { id: postId }, data: { results: results as Prisma.InputJsonValue, status: "publishing" } });
  return publishPost(postId, now);
}

/** Cron: posts that are due (claimed one at a time so two runs never post twice), then Instagram videos waiting. */
export async function publishDue(now = new Date()) {
  const due = await db.socialPost.findMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, take: 25, select: { id: true } });
  let posted = 0;
  for (const { id } of due) {
    const claimed = await db.socialPost.updateMany({ where: { id, status: "scheduled" }, data: { status: "publishing" } });
    if (claimed.count !== 1) continue;
    await publishPost(id, now).catch((error) => console.error("[social-posts] publish failed", id, error instanceof Error ? error.message : error));
    posted++;
  }
  // Still publishing two minutes on: an Instagram reel processing, or a run that stopped half way.
  const stuck = await db.socialPost.findMany({ where: { status: "publishing", updatedAt: { lte: new Date(now.getTime() - 2 * 60 * 1000) } }, take: 25, select: { id: true } });
  for (const { id } of stuck) await publishPost(id, now).catch(() => undefined);
  return { due: due.length, posted, retried: stuck.length };
}

/**
 * The open post page asks every few seconds while a post is going out (POST /api/app/social-posts/[id] "check"):
 * publishes an Instagram reel the moment Instagram has it ready, instead of waiting for the next cron run. Skips a
 * post another check touched in the last 2 seconds, so several open tabs don't double up.
 */
export async function checkPost(postId: string, now = new Date()) {
  const touched = await db.socialPost.updateMany({ where: { id: postId, status: "publishing", updatedAt: { lte: new Date(now.getTime() - 2000) } }, data: { updatedAt: now } });
  if (touched.count === 1) return publishPost(postId, now);
  return db.socialPost.findUnique({ where: { id: postId } });
}
