// Post scheduler rules shared by the API, the publisher and the screen (pure: no imports, tested directly).

export const SOCIAL_PLATFORMS = ["facebook", "instagram"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const CAPTION_MAX = 2200; // Instagram's limit; Facebook allows more
export const MIN_LEAD_MINUTES = 5; // the cron runs every 10 minutes
export const MAX_DAYS_AHEAD = 75; // Meta keeps Page tokens alive, but plans this far out go stale
export const MAX_ATTEMPTS = 3;

export interface ScheduleInput {
  platforms: string[];
  caption: string;
  imageUrl?: string | null;
  link?: string | null;
  scheduledAt: string | Date;
}

export type ScheduleCheck =
  | { ok: true; value: { platforms: SocialPlatform[]; caption: string; imageUrl: string | null; link: string | null; scheduledAt: Date } }
  | { ok: false; error: string };

function httpsUrl(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Checks a post before it's saved; connected lists the platforms the store has accounts for. */
export function checkScheduledPost(input: ScheduleInput, connected: readonly string[], now = new Date()): ScheduleCheck {
  const platforms = [...new Set(input.platforms)].filter((p): p is SocialPlatform => (SOCIAL_PLATFORMS as readonly string[]).includes(p));
  if (!platforms.length) return { ok: false, error: "Choose Facebook, Instagram or both." };
  const missing = platforms.find((p) => !connected.includes(p));
  if (missing) return { ok: false, error: `Connect your ${missing === "facebook" ? "Facebook Page" : "Instagram account"} first.` };

  const caption = input.caption.trim();
  if (!caption) return { ok: false, error: "Write a caption." };
  if (caption.length > CAPTION_MAX) return { ok: false, error: `Keep the caption under ${CAPTION_MAX} characters.` };

  const imageUrl = httpsUrl(input.imageUrl);
  if (imageUrl === undefined) return { ok: false, error: "The picture must be a public https link." };
  const link = httpsUrl(input.link);
  if (link === undefined) return { ok: false, error: "The link must start with https://." };
  if (platforms.includes("instagram") && !imageUrl) return { ok: false, error: "Instagram posts need a picture. Pick a product with a photo." };

  const scheduledAt = input.scheduledAt instanceof Date ? input.scheduledAt : new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "Pick a date and time." };
  if (scheduledAt.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) return { ok: false, error: `Pick a time at least ${MIN_LEAD_MINUTES} minutes from now.` };
  if (scheduledAt.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return { ok: false, error: `Pick a time within the next ${MAX_DAYS_AHEAD} days.` };

  return { ok: true, value: { platforms, caption, imageUrl, link, scheduledAt } };
}

/** "instagram" (and Facebook photo posts): the link goes under the caption as text. "facebook" text posts: left out, it becomes the link preview. */
export function captionFor(platform: SocialPlatform, caption: string, link: string | null) {
  if (!link || caption.includes(link)) return caption;
  return platform === "instagram" ? `${caption}\n\n${link}`.slice(0, CAPTION_MAX) : caption;
}

export type PlatformResult = { ok: true; id: string; url?: string | null } | { ok: false; error: string; retry?: boolean };

/** The post's status once each platform has been tried. */
export function overallStatus(results: Partial<Record<SocialPlatform, PlatformResult>>, platforms: readonly SocialPlatform[]) {
  const done = platforms.map((p) => results[p]).filter(Boolean) as PlatformResult[];
  const okCount = done.filter((r) => r.ok).length;
  if (okCount === platforms.length) return "published" as const;
  if (okCount > 0) return "partial" as const;
  return "failed" as const;
}
