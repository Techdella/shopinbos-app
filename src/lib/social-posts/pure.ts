// Social posts (Marketing > Social posts): the channels a post can go to, the sizes each one wants, the calendar
// (Lagos time), the posting queue's next free slot, what's wrong with a post before it goes out, and the overall
// status from each channel's result. Pure (no imports, no database, no network) so tests/social-posts.test.mjs can
// run it directly.

// ─── Channels ───────────────────────────────────────────────────────────────

export const POST_FORMAT_KEYS = ["square", "portrait", "story", "landscape"] as const;
export type PostFormat = (typeof POST_FORMAT_KEYS)[number];

/** The sizes we prepare pictures at. Landscape is 16:9: inside Instagram's 1.91:1 limit and full width on X. */
export const POST_FORMATS: Record<PostFormat, { width: number; height: number; ratio: string }> = {
  square: { width: 1080, height: 1080, ratio: "1:1" },
  portrait: { width: 1080, height: 1350, ratio: "4:5" },
  story: { width: 1080, height: 1920, ratio: "9:16" },
  landscape: { width: 1200, height: 675, ratio: "16:9" },
};

export const POST_CHANNEL_KEYS = ["instagram", "facebook", "whatsapp", "tiktok", "x"] as const;
export type PostChannel = (typeof POST_CHANNEL_KEYS)[number];

export interface PostChannelSpec {
  key: PostChannel;
  label: string;
  /** Posts by itself through the connected Facebook Page; the others are posted by the seller in one tap. */
  auto: boolean;
  /** Can't post without a picture or video. */
  needsMedia: boolean;
  /** Sizes the channel shows well, best first. */
  formats: readonly PostFormat[];
  /** Caption limit (characters). */
  limit: number;
}

export const POST_CHANNELS: readonly PostChannelSpec[] = [
  { key: "instagram", label: "Instagram", auto: true, needsMedia: true, formats: ["portrait", "square", "story", "landscape"], limit: 2200 },
  { key: "facebook", label: "Facebook", auto: true, needsMedia: false, formats: ["square", "portrait", "landscape", "story"], limit: 5000 },
  { key: "whatsapp", label: "WhatsApp Status", auto: false, needsMedia: false, formats: ["story", "square", "portrait"], limit: 700 },
  { key: "tiktok", label: "TikTok", auto: false, needsMedia: true, formats: ["story"], limit: 2200 },
  { key: "x", label: "X", auto: false, needsMedia: false, formats: ["landscape", "square"], limit: 280 },
];

export function channelSpec(key: PostChannel): PostChannelSpec {
  return POST_CHANNELS.find((item) => item.key === key)!;
}

export function isPostChannel(value: unknown): value is PostChannel {
  return typeof value === "string" && (POST_CHANNEL_KEYS as readonly string[]).includes(value);
}

export function isPostFormat(value: unknown): value is PostFormat {
  return typeof value === "string" && (POST_FORMAT_KEYS as readonly string[]).includes(value);
}

/** Keeps known channels, once each, in the standard order. */
export function cleanChannels(values: readonly unknown[]): PostChannel[] {
  return POST_CHANNEL_KEYS.filter((key) => values.includes(key));
}

/**
 * The size that suits the picked channels: one every channel shows well when there is one, then the one most of
 * them like best (a channel's favourite counts 3, any size it shows well 1; ties go to the earlier size). Square
 * with none.
 */
export function recommendFormat(channels: readonly PostChannel[]): PostFormat {
  if (!channels.length) return "square";
  const rank = (format: PostFormat) => {
    let score = 0;
    let everywhere = true;
    for (const channel of channels) {
      const index = channelSpec(channel).formats.indexOf(format);
      if (index < 0) everywhere = false;
      else score += index === 0 ? 3 : 1;
    }
    return (everywhere ? 100 : 0) + score;
  };
  return POST_FORMAT_KEYS.reduce((best, format) => (rank(format) > rank(best) ? format : best), POST_FORMAT_KEYS[0]);
}

/** The size closest to a picture's shape (for a video, the only size it can go out at). */
export function formatForShape(width: number | null | undefined, height: number | null | undefined): PostFormat | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  let best: PostFormat = "square";
  let gap = Infinity;
  for (const key of POST_FORMAT_KEYS) {
    const format = POST_FORMATS[key];
    const diff = Math.abs(Math.log(ratio / (format.width / format.height)));
    if (diff < gap) {
      gap = diff;
      best = key;
    }
  }
  return best;
}

/** "1080 × 1350" */
export function formatSize(format: PostFormat) {
  const { width, height } = POST_FORMATS[format];
  return `${width} × ${height}`;
}

/** Instagram picture posts at 9:16 go out as a story; videos go out as reels. */
export function instagramKind(format: PostFormat, mediaKind: MediaKind | null): "feed" | "story" | "reel" {
  if (mediaKind === "video") return "reel";
  return format === "story" ? "story" : "feed";
}

// ─── Problems before posting ────────────────────────────────────────────────

export type MediaKind = "image" | "video";

export type PostProblem =
  | { channel: PostChannel; kind: "needs_media" }
  | { channel: PostChannel; kind: "too_long"; limit: number }
  | { channel: PostChannel; kind: "size"; best: PostFormat }
  | { channel: PostChannel; kind: "video_type" }
  | { channel: PostChannel; kind: "not_connected" };

export interface PostDraft {
  channels: readonly PostChannel[];
  caption: string;
  format: PostFormat;
  mediaUrl: string | null;
  mediaKind: MediaKind | null;
  /** The text added after the caption (the product link), counted against the limit. */
  linkLength?: number;
}

/**
 * What would stop or spoil the post on each channel. "size" is advice (the picture still goes out at the picked
 * size); the rest block that channel. `connected`: the auto channels that have an account linked.
 */
export function postProblems(draft: PostDraft, connected: Partial<Record<PostChannel, boolean>> = {}): PostProblem[] {
  const problems: PostProblem[] = [];
  const caption = draft.caption.trim();
  for (const channel of draft.channels) {
    const spec = channelSpec(channel);
    if (spec.auto && connected[channel] === false) problems.push({ channel, kind: "not_connected" });
    if (spec.needsMedia && !draft.mediaUrl) problems.push({ channel, kind: "needs_media" });
    // X counts every link as 23 characters.
    const linkLength = draft.linkLength ? (channel === "x" ? 24 : draft.linkLength + 1) : 0;
    if (caption.length + linkLength > spec.limit) problems.push({ channel, kind: "too_long", limit: spec.limit });
    if (draft.mediaUrl && !spec.formats.includes(draft.format)) problems.push({ channel, kind: "size", best: spec.formats[0] });
    // Facebook and Instagram take MP4 or MOV; the browser recorder sometimes saves WebM.
    if (draft.mediaKind === "video" && spec.auto && draft.mediaUrl && /\.webm(\?|$)/i.test(draft.mediaUrl)) problems.push({ channel, kind: "video_type" });
  }
  return problems;
}

export function blockingProblems(problems: readonly PostProblem[]) {
  return problems.filter((problem) => problem.kind !== "size");
}

// ─── Results and status ─────────────────────────────────────────────────────

export const POST_STATUSES = ["draft", "scheduled", "publishing", "posted", "partial", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * One channel's outcome. posted: we posted it; ready: waiting for the seller's tap (WhatsApp, TikTok, X); shared:
 * they did; waiting: Instagram is still processing the video (container); failed: with the reason.
 */
export type ChannelResult =
  | { status: "posted"; id?: string; url?: string; at: string }
  | { status: "ready"; at: string }
  | { status: "shared"; at: string }
  | { status: "waiting"; container: string; at: string; since?: string }
  | { status: "failed"; error: string; reconnect?: boolean; at: string };

export type PostResults = Partial<Record<PostChannel, ChannelResult>>;

export function readResults(value: unknown): PostResults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PostResults = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isPostChannel(key) || !raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const at = typeof item.at === "string" ? item.at : new Date(0).toISOString();
    switch (item.status) {
      case "posted":
        out[key] = { status: "posted", at, ...(typeof item.id === "string" ? { id: item.id } : {}), ...(typeof item.url === "string" ? { url: item.url } : {}) };
        break;
      case "ready":
      case "shared":
        out[key] = { status: item.status, at };
        break;
      case "waiting":
        if (typeof item.container === "string") out[key] = { status: "waiting", container: item.container, at, ...(typeof item.since === "string" ? { since: item.since } : {}) };
        break;
      case "failed":
        out[key] = { status: "failed", at, error: typeof item.error === "string" ? item.error : "Something went wrong", ...(item.reconnect === true ? { reconnect: true } : {}) };
        break;
    }
  }
  return out;
}

/** The post's status once every channel has a result. Channels without one keep it "publishing". */
export function statusFromResults(channels: readonly PostChannel[], results: PostResults): PostStatus {
  if (!channels.length) return "draft";
  const list = channels.map((channel) => results[channel]);
  if (list.some((item) => !item || item.status === "waiting")) return "publishing";
  const failed = list.filter((item) => item!.status === "failed").length;
  if (failed === list.length) return "failed";
  if (failed) return "partial";
  return "posted";
}

/** Manual channels still waiting for the seller's tap. */
export function readyToShare(channels: readonly PostChannel[], results: PostResults): PostChannel[] {
  return channels.filter((channel) => results[channel]?.status === "ready");
}

/**
 * The seller says they posted it themselves ("Mark as posted" in the phone app, or Share from Create with Rex).
 * `channel`: that one (any channel that hasn't posted and isn't still processing); null: every WhatsApp, TikTok and
 * X channel still waiting for their tap or not reached yet. Facebook and Instagram are left to post by themselves
 * unless named. Returns the new results and the channels it changed (none: nothing to mark).
 */
export function markShared(channels: readonly PostChannel[], results: PostResults, channel: PostChannel | null, now: Date): { results: PostResults; changed: PostChannel[] } {
  const next: PostResults = { ...results };
  const open = (key: PostChannel) => !next[key] || next[key]!.status === "ready" || next[key]!.status === "failed";
  const targets = channel ? (channels.includes(channel) && open(channel) ? [channel] : []) : channels.filter((key) => !channelSpec(key).auto && open(key));
  for (const key of targets) next[key] = { status: "shared", at: now.toISOString() };
  return { results: next, changed: targets };
}

/**
 * The status after marking: a draft or scheduled post keeps its status until every channel has a result (Facebook
 * and Instagram still go out at the time); one that has gone out takes the status from its results.
 */
export function statusAfterShare(current: string, channels: readonly PostChannel[], results: PostResults): PostStatus {
  const waiting = current === "draft" || current === "scheduled";
  if (waiting && channels.some((key) => !results[key])) return current as PostStatus;
  return statusFromResults(channels, results);
}

// ─── Lagos time and the calendar ────────────────────────────────────────────

/** West Africa Time: UTC+1 all year, no daylight saving. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** The Lagos wall clock for a moment. */
export function lagosParts(date: Date) {
  const shifted = new Date(date.getTime() + LAGOS_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    /** 0 = Monday … 6 = Sunday */
    weekday: (shifted.getUTCDay() + 6) % 7,
  };
}

/** "2026-10-21" in Lagos. */
export function lagosDayKey(date: Date) {
  const p = lagosParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "09:30" in Lagos. */
export function lagosTime(date: Date) {
  const p = lagosParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** A Lagos day ("2026-10-21") and time ("09:30") → the moment. Null when either doesn't parse. */
export function fromLagos(day: string, time = "09:00"): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, date, hour, minute] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (month < 1 || month > 12 || date < 1 || date > 31 || hour > 23 || minute > 59) return null;
  const utc = Date.UTC(year, month - 1, date, hour, minute) - LAGOS_OFFSET_MS;
  const result = new Date(utc);
  // 2026-02-31 rolls into March: not a real day.
  return lagosDayKey(result) === day ? result : null;
}

export function isDayKey(value: unknown): value is string {
  return typeof value === "string" && fromLagos(value) !== null;
}

/** "2026-10" from ?month=, or this month in Lagos. */
export function parseMonth(value: string | null | undefined, now: Date) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) return { year: Number(match[1]), month: Number(match[2]) };
  const p = lagosParts(now);
  return { year: p.year, month: p.month };
}

export function monthKey(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

function shiftMonth(year: number, month: number, by: number) {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The month as weeks of day keys, Monday first, padded with the days of the months around it so every week has 7.
 * `start`/`end`: the moments the grid covers (for the database query).
 */
export function monthGrid(year: number, month: number) {
  const first = fromLagos(`${year}-${pad(month)}-01`, "00:00")!;
  const lead = lagosParts(first).weekday;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: Array<Array<{ key: string; day: number; inMonth: boolean }>> = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let index = 0; index < cells; index++) {
    const date = new Date(first.getTime() + (index - lead) * dayMs);
    const p = lagosParts(date);
    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ key: lagosDayKey(date), day: p.day, inMonth: p.month === month });
  }
  const start = new Date(first.getTime() - lead * dayMs);
  const end = new Date(start.getTime() + cells * dayMs);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  return { year, month, weeks, start, end, prev: monthKey(prev.year, prev.month), next: monthKey(next.year, next.month) };
}

// ─── The queue ──────────────────────────────────────────────────────────────

/** "Add to queue" times (Lagos): morning, lunch and evening, when Nigerian shoppers scroll most. */
export const QUEUE_TIMES = ["08:00", "13:00", "19:30"] as const;

/**
 * The next queue time that's at least 10 minutes away and has nothing else planned within 30 minutes of it, up to
 * 60 days ahead (then the first time after the last post).
 */
export function nextQueueSlot(taken: readonly Date[], now: Date, times: readonly string[] = QUEUE_TIMES): Date {
  const earliest = now.getTime() + 10 * 60 * 1000;
  const busy = taken.map((date) => date.getTime());
  const near = (at: number) => busy.some((time) => Math.abs(time - at) < 30 * 60 * 1000);
  const dayMs = 24 * 60 * 60 * 1000;
  for (let offset = 0; offset < 60; offset++) {
    const day = lagosDayKey(new Date(now.getTime() + offset * dayMs));
    for (const time of times) {
      const slot = fromLagos(day, time);
      if (slot && slot.getTime() >= earliest && !near(slot.getTime())) return slot;
    }
  }
  return new Date(Math.max(earliest, ...busy) + 60 * 60 * 1000);
}
