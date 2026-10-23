import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { storageBase, storedBytesProblem } from "@/lib/help-videos.server";
import { isMissingTable } from "@/lib/rate-limit-core";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { parseVideoLink, type VideoSource } from "@shared/help-videos";
import {
  MOTION_STYLES,
  UPDATE_BODY_MAX,
  UPDATE_FOLDER,
  UPDATE_KINDS,
  UPDATE_ROLES,
  UPDATE_THEMES,
  UPDATE_TITLE_MAX,
  isOwnUpdateFile,
  safeCtaUrl,
  updateStatus,
  updateUploadProblem,
  type UpdateKind,
  type UpdateRole,
} from "@shared/weekly-updates";

// Weekly updates from the Shopinbos team (model WeeklyUpdate, docs/migrations/2026-11-26-weekly-updates.sql).
// Files live in the public media bucket under platform/updates/; pasted video links may only be YouTube or Vimeo.

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";
export const UPDATES_MIGRATION = "Run docs/migrations/2026-11-26-weekly-updates.sql first.";

export const UPDATE_SELECT = {
  id: true,
  kind: true,
  title: true,
  body: true,
  theme: true,
  motion: true,
  mediaUrl: true,
  posterUrl: true,
  durationSeconds: true,
  ctaLabel: true,
  ctaUrl: true,
  roles: true,
  published: true,
  publishAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface UpdateRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  theme: string;
  motion: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  roles: string[];
  published: boolean;
  publishAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An update as the viewer plays it. Video links are resolved here, so the browser never loads another host. */
export interface PublicUpdate {
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

/** How to play a stored video: a YouTube/Vimeo embed or a file we stored for updates; anything else is null. */
export function updateVideoSource(url: string | null | undefined): VideoSource | null {
  if (!url) return null;
  const link = parseVideoLink(url);
  if (link) return link;
  return isOwnUpdateFile(url, storageBase()) ? { kind: "file", url } : null;
}

export function toPublicUpdate(row: UpdateRow, seen: boolean): PublicUpdate | null {
  const kind = UPDATE_KINDS.some((item) => item.value === row.kind) ? (row.kind as UpdateKind) : "text";
  const video = kind === "video" ? updateVideoSource(row.mediaUrl) : null;
  const imageUrl = kind === "image" && isOwnUpdateFile(row.mediaUrl, storageBase()) ? row.mediaUrl : null;
  if ((kind === "video" && !video) || (kind === "image" && !imageUrl)) return null;
  const poster = row.posterUrl && isOwnUpdateFile(row.posterUrl, storageBase()) ? row.posterUrl : video?.kind === "youtube" ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null;
  const ctaUrl = safeCtaUrl(row.ctaUrl);
  return {
    id: row.id,
    kind,
    title: row.title,
    body: row.body,
    theme: row.theme,
    motion: row.motion,
    imageUrl,
    video,
    posterUrl: poster,
    durationSeconds: row.durationSeconds,
    cta: row.ctaLabel && ctaUrl ? { label: row.ctaLabel, url: ctaUrl } : null,
    publishedAt: (row.publishAt ?? row.createdAt).toISOString(),
    seen,
  };
}

/** Live updates for a role, oldest first (the order they play in), with whether this person has seen each. */
export async function liveUpdatesFor(role: UpdateRole, userId: string, now = new Date()): Promise<PublicUpdate[]> {
  try {
    const rows = await db.weeklyUpdate.findMany({
      where: {
        published: true,
        roles: { has: role },
        OR: [{ publishAt: null }, { publishAt: { lte: now } }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      orderBy: [{ publishAt: "asc" }, { createdAt: "asc" }],
      select: UPDATE_SELECT,
      take: 30,
    });
    if (!rows.length) return [];
    const views = await db.weeklyUpdateView.findMany({ where: { userId, updateId: { in: rows.map((row) => row.id) } }, select: { updateId: true } });
    const seen = new Set(views.map((view) => view.updateId));
    return rows.map((row) => toPublicUpdate(row, seen.has(row.id))).filter((update): update is PublicUpdate => Boolean(update));
  } catch (error) {
    if (!isMissingTable(error)) console.error("[updates] list failed", error);
    return [];
  }
}

/** Marks an update seen by this person (once; a second view changes nothing). */
export async function markUpdateSeen(updateId: string, userId: string) {
  await db.weeklyUpdateView.upsert({ where: { updateId_userId: { updateId, userId } }, create: { updateId, userId }, update: {} });
}

// ─── Admin input ─────────────────────────────────────────────────────────────

const ROLE_VALUES = UPDATE_ROLES.map((role) => role.value) as [UpdateRole, ...UpdateRole[]];
const KIND_VALUES = UPDATE_KINDS.map((kind) => kind.value) as [UpdateKind, ...UpdateKind[]];
const THEME_VALUES = UPDATE_THEMES.map((theme) => theme.value) as [string, ...string[]];
const MOTION_VALUES = MOTION_STYLES.map((style) => style.value) as [string, ...string[]];

const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional().transform((value) => (value ? value : null));
const optionalDate = z.union([z.string().datetime({ offset: true }), z.null()]).optional().transform((value) => (value ? new Date(value) : null));

export const UpdateInput = z
  .object({
    kind: z.enum(KIND_VALUES),
    title: z.string().trim().min(3, "Give the update a short title.").max(UPDATE_TITLE_MAX, `Keep the title under ${UPDATE_TITLE_MAX} characters.`),
    body: optionalText(UPDATE_BODY_MAX),
    theme: z.enum(THEME_VALUES).default("navy"),
    motion: z.union([z.enum(MOTION_VALUES), z.null()]).optional().transform((value) => value ?? null),
    mediaUrl: optionalText(2048),
    posterUrl: optionalText(2048),
    durationSeconds: z.union([z.number().int().min(1).max(600), z.null()]).optional().transform((value) => value ?? null),
    ctaLabel: optionalText(30),
    ctaUrl: optionalText(500),
    roles: z.array(z.enum(ROLE_VALUES)).min(1, "Pick who should see it.").max(3),
    published: z.boolean().default(false),
    publishAt: optionalDate,
    expiresAt: optionalDate,
  })
  .superRefine((input, ctx) => {
    if ((input.kind === "text" || input.kind === "motion") && !input.body) ctx.addIssue({ code: "custom", path: ["body"], message: "Write the words for the card." });
    if (input.ctaLabel && !safeCtaUrl(input.ctaUrl)) ctx.addIssue({ code: "custom", path: ["ctaUrl"], message: "The button needs a link: a page in the app (like /home/ads) or an https link." });
    if (input.publishAt && input.expiresAt && input.expiresAt <= input.publishAt) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "The end date has to be after the start date." });
  })
  .transform((input) => ({
    ...input,
    motion: input.kind === "motion" ? input.motion ?? "rise" : null,
    // Text and motion cards carry no media; images carry no poster.
    mediaUrl: input.kind === "image" || input.kind === "video" ? input.mediaUrl : null,
    posterUrl: input.kind === "video" ? input.posterUrl : null,
    durationSeconds: input.kind === "video" ? input.durationSeconds : null,
    ctaUrl: input.ctaLabel ? safeCtaUrl(input.ctaUrl) : null,
  }));
export type UpdateInputData = z.output<typeof UpdateInput>;

const TYPE_BY_EXT: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const EXT_BY_TYPE: Record<string, string> = Object.fromEntries(Object.entries(TYPE_BY_EXT).map(([ext, type]) => [type, ext]));

/** Plain reason the media can't be saved, or null. Uploaded files are checked byte by byte; unchanged ones are skipped. */
export async function updateMediaProblem(input: UpdateInputData, before?: Pick<UpdateRow, "mediaUrl" | "posterUrl"> | null): Promise<string | null> {
  if (input.kind === "image" && !input.mediaUrl) return "Upload the picture first.";
  if (input.kind === "video" && !input.mediaUrl) return "Add a video: upload one or paste a YouTube or Vimeo link.";
  const checks: Array<{ url: string | null; kind: "video" | "image" }> = [
    { url: input.mediaUrl !== before?.mediaUrl ? input.mediaUrl : null, kind: input.kind === "video" ? "video" : "image" },
    { url: input.posterUrl !== before?.posterUrl ? input.posterUrl : null, kind: "image" },
  ];
  for (const check of checks) {
    if (!check.url) continue;
    if (check.kind === "video" && parseVideoLink(check.url)) continue;
    if (!isOwnUpdateFile(check.url, storageBase())) return check.kind === "video" ? "Paste a YouTube or Vimeo link, or upload an MP4 or WebM file." : "Upload the picture here (JPG, PNG, WebP or GIF).";
    const type = TYPE_BY_EXT[check.url.split("?")[0]!.split(".").pop()?.toLowerCase() ?? ""];
    if (!type || (check.kind === "video") !== type.startsWith("video/")) return check.kind === "video" ? "Upload an MP4 or WebM video." : "Use a JPG, PNG, WebP or GIF picture.";
    const problem = await storedBytesProblem(check.url, type);
    if (problem) return problem;
  }
  return null;
}

/** Removes a file we stored for an update (best effort), when it's replaced or the update is deleted. */
export async function removeUpdateFile(url: string | null | undefined) {
  const base = storageBase();
  if (!isOwnUpdateFile(url, base)) return;
  try {
    const supabase = await getSupabaseServiceClient();
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(url!.slice(base.length).split("?")[0]!)]);
  } catch {
    // Already gone; a leftover file is harmless.
  }
}

export class UpdateUploadRejected extends Error {}

/** A one-time signed upload URL under platform/updates/ (the browser PUTs the file straight to Storage). */
export async function signedUpdateUpload(kind: "video" | "image", type: string, size: number) {
  const base = type.toLowerCase().split(";")[0]!.trim();
  const problem = updateUploadProblem(kind, base, size);
  if (problem) throw new UpdateUploadRejected(problem);
  const path = `${UPDATE_FOLDER}/${kind === "video" ? "videos" : "images"}/${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 16)}.${EXT_BY_TYPE[base]}`;
  const supabase = await getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "No signed upload URL");
  return { path, token: data.token, signedUrl: data.signedUrl, publicUrl: `${storageBase()}${path}`, contentType: base };
}

/** Admin list rows: every update with its status and how many people have seen it. */
export async function adminUpdateRows() {
  const rows = await db.weeklyUpdate.findMany({ orderBy: [{ publishAt: "desc" }, { createdAt: "desc" }], select: { ...UPDATE_SELECT, _count: { select: { views: true } } }, take: 200 });
  return rows.map(({ _count, ...row }) => toAdminRow(row, _count.views));
}

export function toAdminRow(row: UpdateRow, views = 0) {
  return {
    ...row,
    publishAt: row.publishAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: updateStatus(row),
    views,
  };
}
