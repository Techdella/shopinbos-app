// The phone app's posts calendar for sellers is the web's Social posts calendar: these turn a SocialPost into the
// app's `Post` shape (apps/mobile/src/lib/familiar.ts) and the app's choices back into a Social posts body. Pure
// (no server imports) so tests/create-posts.test.mjs can run it. Routes: src/app/api/mobile/posts/**.

import { POST_CHANNEL_KEYS, channelSpec, cleanChannels, formatForShape, readResults, recommendFormat, type PostChannel, type PostFormat, type PostResults } from "./pure.ts";

/** The app's order: WhatsApp first (most sellers' main channel), then Instagram, Facebook, TikTok and X. */
export const PHONE_CHANNELS = ["whatsapp", "instagram", "facebook", "tiktok", "x"] as const satisfies readonly PostChannel[];

/** What the app shows: posted and partial as Posted, publishing as Scheduled, failed as needing attention. */
export type PhoneStatus = "draft" | "scheduled" | "posted" | "attention";

export function phoneStatus(status: string): PhoneStatus {
  if (status === "scheduled" || status === "publishing") return "scheduled";
  if (status === "posted" || status === "partial") return "posted";
  if (status === "failed") return "attention";
  return "draft";
}

/** Known channels in the app's order. */
export function phoneChannels(values: readonly unknown[]): PostChannel[] {
  const clean = cleanChannels(values);
  return PHONE_CHANNELS.filter((key) => clean.includes(key));
}

/**
 * One channel of a post. auto: posts by itself (Facebook or Instagram with the Page connected); state: pending (not
 * its time yet), waiting (Instagram processing), ready (the seller's tap), shared (they did), posted, failed.
 */
export interface PhoneChannel {
  key: PostChannel;
  auto: boolean;
  state: "pending" | "waiting" | "ready" | "shared" | "posted" | "failed";
  url?: string;
  error?: string;
}

export function phoneChannelResults(channels: readonly unknown[], results: PostResults, connected: Partial<Record<PostChannel, boolean>>): PhoneChannel[] {
  return phoneChannels(channels).map((key) => {
    const result = results[key];
    const auto = channelSpec(key).auto && connected[key] === true;
    if (!result) return { key, auto, state: "pending" };
    if (result.status === "posted") return { key, auto, state: "posted", ...(result.url ? { url: result.url } : {}) };
    if (result.status === "failed") return { key, auto, state: "failed", error: result.error };
    return { key, auto, state: result.status };
  });
}

export interface SocialPostRow {
  id: string;
  caption: string;
  mediaUrl: string | null;
  mediaKind: string | null;
  renderedUrl: string | null;
  mediaSource: string | null;
  format: string;
  channels: string[];
  status: string;
  scheduledAt: Date | null;
  postedAt: Date | null;
  results: unknown;
}

/** A SocialPost as the app's `Post`, plus the per-channel results the seller's screens use. */
export function phonePostView(post: SocialPostRow, connected: Partial<Record<PostChannel, boolean>> = {}) {
  const results = readResults(post.results);
  const channels = phoneChannelResults(post.channels, results, connected);
  return {
    id: post.id,
    // The app shows pictures; a video post shows its placeholder.
    imageUrl: post.mediaKind === "video" ? null : (post.renderedUrl ?? post.mediaUrl),
    caption: post.caption,
    platforms: channels.map((item) => item.key),
    status: phoneStatus(post.status),
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    postedAt: post.postedAt?.toISOString() ?? null,
    kind: "social" as const,
    format: post.format,
    mediaSource: post.mediaSource,
    channels,
    /** WhatsApp, TikTok or X waiting for the seller's tap. */
    yourTurn: channels.some((item) => item.state === "ready"),
  };
}

/** The size a Create with Rex design is (status and reel covers 9:16 → story, post → square, flyer 4:5 → portrait). */
export function formatForDesign(size: { width: number; height: number } | null | undefined, channels: readonly PostChannel[]): PostFormat {
  return formatForShape(size?.width, size?.height) ?? recommendFormat(channels);
}

/** The app's platforms as Social posts channels (unknown ones dropped). */
export function channelsFromPlatforms(platforms: readonly unknown[]): PostChannel[] {
  return cleanChannels(platforms.map((item) => String(item).toLowerCase().trim()).filter((item) => (POST_CHANNEL_KEYS as readonly string[]).includes(item)));
}

/**
 * When the post goes: a time schedules it through the web's scheduling, no time keeps it as a draft (the app's
 * "Share now" saves a draft, then marks it shared).
 */
export function whenFor(scheduledAt: string | null | undefined): "schedule" | "draft" {
  return scheduledAt ? "schedule" : "draft";
}
