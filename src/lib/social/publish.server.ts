import "server-only";

import { db } from "@/lib/db/client";
import { decryptJson } from "@/lib/inbox/crypto";
import { GRAPH_URL, providerError, readJson } from "@/lib/inbox/channels/types";
import { taggedProductLink } from "./share";
import { captionFor, checkScheduledPost, MAX_ATTEMPTS, overallStatus, type PlatformResult, type ScheduleInput, type SocialPlatform } from "./schedule";

// The post scheduler: Facebook Page posts (photo or text + link) and Instagram feed posts (photo) through the Graph
// API with the Page token saved by "Connect with Facebook" (src/lib/meta/pages-login.server.ts). /api/cron/marketing
// calls publishDuePosts every 10 minutes. Network trouble is retried up to MAX_ATTEMPTS; Facebook's refusals aren't.

export interface SocialAccountView {
  platform: SocialPlatform;
  name: string;
  status: string;
  lastError: string | null;
}

export interface ScheduledPostView {
  id: string;
  platforms: SocialPlatform[];
  caption: string;
  imageUrl: string | null;
  link: string | null;
  scheduledAt: string;
  status: string;
  results: Partial<Record<SocialPlatform, PlatformResult>>;
  publishedAt: string | null;
}

export async function socialAccounts(storeId: string): Promise<SocialAccountView[]> {
  const rows = await db.socialAccount.findMany({ where: { storeId }, orderBy: { platform: "asc" } });
  return rows.map((row) => ({ platform: row.platform as SocialPlatform, name: row.name, status: row.status, lastError: row.lastError }));
}

function viewOf(row: { id: string; platforms: string[]; caption: string; imageUrl: string | null; link: string | null; scheduledAt: Date; status: string; results: unknown; publishedAt: Date | null }): ScheduledPostView {
  return {
    id: row.id,
    platforms: row.platforms as SocialPlatform[],
    caption: row.caption,
    imageUrl: row.imageUrl,
    link: row.link,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    results: (row.results ?? {}) as ScheduledPostView["results"],
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

/** Upcoming posts first (soonest first), then the last 20 finished ones. */
export async function scheduledPosts(storeId: string): Promise<ScheduledPostView[]> {
  const [upcoming, done] = await Promise.all([
    db.scheduledPost.findMany({ where: { storeId, status: { in: ["scheduled", "publishing"] } }, orderBy: { scheduledAt: "asc" }, take: 50 }),
    db.scheduledPost.findMany({ where: { storeId, status: { in: ["published", "partial", "failed", "canceled"] } }, orderBy: { scheduledAt: "desc" }, take: 20 }),
  ]);
  return [...upcoming, ...done].map(viewOf);
}

export async function schedulePost(storeId: string, input: ScheduleInput & { productId?: string | null }) {
  const connected = (await db.socialAccount.findMany({ where: { storeId, status: "connected" }, select: { platform: true } })).map((a) => a.platform);
  const check = checkScheduledPost(input, connected);
  if (!check.ok) return check;
  let productId: string | null = null;
  if (input.productId) {
    const product = await db.storeProduct.findFirst({ where: { id: input.productId, storeId }, select: { id: true } });
    productId = product?.id ?? null;
  }
  const row = await db.scheduledPost.create({ data: { storeId, ...check.value, productId } });
  return { ok: true as const, post: viewOf(row) };
}

export async function cancelPost(storeId: string, id: string) {
  const { count } = await db.scheduledPost.updateMany({ where: { id, storeId, status: "scheduled" }, data: { status: "canceled" } });
  return count > 0;
}

export async function disconnectSocialAccount(storeId: string, platform: SocialPlatform) {
  await db.socialAccount.deleteMany({ where: { storeId, platform } });
}

// ─── Graph API calls ─────────────────────────────────────────────────────────

async function graphPost(path: string, token: string, params: Record<string, string>): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string; retry: boolean }> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH_URL}${path}`, { method: "POST", body, signal: AbortSignal.timeout(30_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Facebook.", retry: true };
  const json = await readJson(res);
  if (!res.ok) return { ok: false, error: providerError(json, "Facebook didn't accept the post."), retry: res.status >= 500 || res.status === 429 };
  return { ok: true, json };
}

async function publishFacebook(pageId: string, token: string, post: { caption: string; imageUrl: string | null; link: string | null }): Promise<PlatformResult> {
  // A text post shows the link as a preview card; a photo post can't, so the link goes under the caption.
  const sent = post.imageUrl
    ? await graphPost(`/${encodeURIComponent(pageId)}/photos`, token, { url: post.imageUrl, caption: captionFor("instagram", post.caption, post.link) })
    : await graphPost(`/${encodeURIComponent(pageId)}/feed`, token, { message: captionFor("facebook", post.caption, post.link), ...(post.link ? { link: post.link } : {}) });
  if (!sent.ok) return sent;
  const id = String(sent.json.post_id ?? sent.json.id ?? "");
  return { ok: true, id, url: id ? `https://www.facebook.com/${id}` : null };
}

async function publishInstagram(igId: string, token: string, post: { caption: string; imageUrl: string | null; link: string | null }): Promise<PlatformResult> {
  if (!post.imageUrl) return { ok: false, error: "Instagram posts need a picture." };
  const container = await graphPost(`/${encodeURIComponent(igId)}/media`, token, { image_url: post.imageUrl, caption: captionFor("instagram", post.caption, post.link) });
  if (!container.ok) return container;
  const creationId = String(container.json.id ?? "");
  // Instagram fetches the picture before the post can go out; give it a few seconds.
  let published: Awaited<ReturnType<typeof graphPost>> | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    published = await graphPost(`/${encodeURIComponent(igId)}/media_publish`, token, { creation_id: creationId });
    if (published.ok || !/not ready|not finished|9007/i.test(published.error)) break;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  if (!published?.ok) return published ?? { ok: false, error: "Instagram didn't publish the post." };
  const id = String(published.json.id ?? "");
  const link = id ? await fetch(`${GRAPH_URL}/${encodeURIComponent(id)}?fields=permalink&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10_000) }).then(readJson).catch(() => ({}) as Record<string, unknown>) : {};
  return { ok: true, id, url: typeof link.permalink === "string" ? link.permalink : null };
}

/** Publishes one post to every platform not yet done. */
async function publishPost(post: { id: string; storeId: string; platforms: string[]; caption: string; imageUrl: string | null; link: string | null; attempts: number; results: unknown }) {
  const platforms = post.platforms as SocialPlatform[];
  const results = { ...((post.results ?? {}) as Partial<Record<SocialPlatform, PlatformResult>>) };
  const accounts = await db.socialAccount.findMany({ where: { storeId: post.storeId, platform: { in: platforms } } });
  let retry = false;

  for (const platform of platforms) {
    if (results[platform]?.ok) continue;
    const account = accounts.find((a) => a.platform === platform);
    const token = decryptJson<{ pageAccessToken?: string }>(account?.tokenEnc)?.pageAccessToken;
    if (!account || !token) {
      results[platform] = { ok: false, error: `Your ${platform === "facebook" ? "Facebook Page" : "Instagram account"} isn't connected any more. Connect it again.` };
      continue;
    }
    // Each platform gets its own tagged link, so visits and orders show under Facebook or Instagram in analytics.
    const content = { caption: post.caption, imageUrl: post.imageUrl, link: post.link ? taggedProductLink(post.link, platform, "scheduled_post") : null };
    const result = platform === "facebook" ? await publishFacebook(account.externalId, token, content) : await publishInstagram(account.externalId, token, content);
    results[platform] = result;
    if (!result.ok && result.retry) retry = true;
    if (!result.ok && !result.retry) await db.socialAccount.update({ where: { id: account.id }, data: { lastError: result.error } }).catch(() => null);
    if (result.ok && account.lastError) await db.socialAccount.update({ where: { id: account.id }, data: { lastError: null } }).catch(() => null);
  }

  const attempts = post.attempts + 1;
  const status = retry && attempts < MAX_ATTEMPTS ? "scheduled" : overallStatus(results, platforms);
  await db.scheduledPost.update({
    where: { id: post.id },
    data: { status, attempts, results: results as object, ...(status === "published" || status === "partial" ? { publishedAt: new Date() } : {}) },
  });
  return status;
}

/** Cron: publish every post whose time has come. Each is claimed first so overlapping runs can't post it twice. */
export async function publishDuePosts(now = new Date()) {
  // A run that died mid-publish leaves posts "publishing"; after 15 minutes they're tried again.
  await db.scheduledPost.updateMany({ where: { status: "publishing", updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) } }, data: { status: "scheduled" } });
  const due = await db.scheduledPost.findMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, take: 25 });
  const counts: Record<string, number> = {};
  for (const post of due) {
    const claimed = await db.scheduledPost.updateMany({ where: { id: post.id, status: "scheduled" }, data: { status: "publishing" } });
    if (!claimed.count) continue;
    const status = await publishPost(post).catch(async (error) => {
      console.error("[social publish] failed", post.id, error);
      await db.scheduledPost.update({ where: { id: post.id }, data: { status: post.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "scheduled", attempts: { increment: 1 } } }).catch(() => null);
      return "error";
    });
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
