import { api } from "@/lib/api";
import type { VideoSource } from "@shared/help-videos";
import type { UpdateKind } from "@shared/weekly-updates";
import type { StatusAuthor, StatusPost, StatusTone } from "@/lib/familiar";

// Weekly updates from the Shopinbos team (selling tips, news), made at /admin/updates on the web. The same feed and
// "seen" record as the ring in the web app's top bar (GET /api/updates, POST /api/updates/:id/view).

export interface TeamUpdate {
  id: string;
  kind: UpdateKind;
  title: string;
  body: string | null;
  theme: string;
  motion: string | null;
  imageUrl: string | null;
  video: VideoSource | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  cta: { label: string; url: string } | null;
  publishedAt: string;
  seen: boolean;
}

export const fetchTeamUpdates = () => api<TeamUpdate[]>("/api/updates").then((data) => (Array.isArray(data) ? data : [])).catch(() => [] as TeamUpdate[]);

export const markTeamUpdateSeen = (id: string) => api(`/api/updates/${encodeURIComponent(id)}/view`, { method: "POST" }).catch(() => null);

// ─── One Shopinbos ring ──────────────────────────────────────────────────────
// Shopinbos's getting-started posts and the team's weekly updates both say "Shopinbos". When both are there, the
// updates join the getting-started posts as one ring (one viewer). Their ids carry TEAM_POST_PREFIX so "seen" and the
// button go to the updates feed (POST /api/updates/:id/view, the update's own link).

export const TEAM_POST_PREFIX = "team:";
export const isTeamPost = (id: string) => id.startsWith(TEAM_POST_PREFIX);
export const teamUpdateId = (id: string) => id.slice(TEAM_POST_PREFIX.length);

const THEME_TONE: Record<string, StatusTone> = { navy: "ink", mint: "mint", teal: "mint", amber: "warn", coral: "peach", plum: "blue", cream: "peach" };

/** A weekly update as a Shopinbos status post. */
export function teamUpdatePost(update: TeamUpdate): StatusPost {
  const video = update.kind === "video" ? update.video : null;
  return {
    id: `${TEAM_POST_PREFIX}${update.id}`,
    headline: update.title,
    caption: update.body,
    imageUrl: update.kind === "image" ? update.imageUrl : null,
    tone: THEME_TONE[update.theme] ?? "ink",
    product: null,
    cta: update.cta ? { kind: "open", label: update.cta.label, target: { userId: "shopinbos", path: update.cta.url } } : null,
    video: video ? { intro: null, url: video.kind === "file" ? video.url : null, watchUrl: video.kind === "file" ? null : video.watchUrl, posterUrl: update.posterUrl, durationSeconds: update.durationSeconds } : null,
    seen: update.seen,
    createdAt: update.publishedAt,
    expiresAt: update.publishedAt,
    views: 0,
    likes: 0,
    liked: false,
  };
}

/** The Status row's authors with the team's updates added to Shopinbos's ring; `merged` when that ring exists. */
export function withTeamUpdates(authors: StatusAuthor[], updates: TeamUpdate[], hidden = false): { authors: StatusAuthor[]; merged: boolean } {
  const index = hidden ? -1 : authors.findIndex((author) => author.official);
  if (index < 0) return { authors, merged: false };
  if (!updates.length) return { authors, merged: true };
  const official = authors[index];
  const posts = [...official.posts, ...updates.map(teamUpdatePost)];
  const next = [...authors];
  next[index] = { ...official, posts, seen: official.seen && updates.every((update) => update.seen) };
  return { authors: next, merged: true };
}
