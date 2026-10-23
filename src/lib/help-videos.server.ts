import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isMissingTable } from "@/lib/rate-limit-core";
import { SNIFF_BYTES, uploadContentProblem } from "@/lib/security/upload-sniff";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  HELP_VIDEO_FOLDER,
  HELP_VIDEO_LANGUAGES,
  HELP_VIDEO_ROLES,
  helpUploadProblem,
  isHelpTopic,
  videoSource,
  type HelpVideoRole,
  type VideoSource,
} from "@shared/help-videos";

// Help-video catalogue (model HelpVideo, docs/migrations/2026-10-18-help-videos.sql). Files live in the public
// media bucket under platform/help-videos/; pasted links may only be YouTube or Vimeo (shared/help-videos.ts).

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

/** Public URL prefix of the media bucket: `${SUPABASE_URL}/storage/v1/object/public/<bucket>/`. */
export function storageBase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return url ? `${url}/storage/v1/object/public/${BUCKET}/` : "";
}

export const HELP_VIDEO_SELECT = {
  id: true,
  topic: true,
  title: true,
  roles: true,
  language: true,
  videoUrl: true,
  posterUrl: true,
  durationSeconds: true,
  published: true,
  updatedAt: true,
} as const;

export type HelpVideoRow = {
  id: string;
  topic: string;
  title: string;
  roles: string[];
  language: string;
  videoUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
  published: boolean;
  updatedAt: Date;
};

export interface PublicHelpVideo {
  id: string;
  topic: string;
  title: string;
  roles: string[];
  language: string;
  videoUrl: string;
  posterUrl: string | null;
  durationSeconds: number | null;
  source: VideoSource;
}

/** A published row as Help shows it; null when its link isn't one we play (never hand out other hosts). */
export function toPublicVideo(row: HelpVideoRow): PublicHelpVideo | null {
  const source = videoSource(row.videoUrl, storageBase());
  if (!row.published || !row.videoUrl || !source) return null;
  const poster = row.posterUrl ?? (source.kind === "youtube" ? `https://i.ytimg.com/vi/${source.id}/hqdefault.jpg` : null);
  return { id: row.id, topic: row.topic, title: row.title, roles: row.roles, language: row.language, videoUrl: row.videoUrl, posterUrl: poster, durationSeconds: row.durationSeconds, source };
}

/** Published videos (optionally for one role), or [] before the migration has run. */
export async function publishedHelpVideos(role?: HelpVideoRole | null): Promise<PublicHelpVideo[]> {
  try {
    const rows = await db.helpVideo.findMany({
      where: { published: true, videoUrl: { not: null }, ...(role ? { roles: { has: role } } : {}) },
      orderBy: [{ topic: "asc" }, { language: "asc" }],
      select: HELP_VIDEO_SELECT,
      take: 500,
    });
    return rows.map(toPublicVideo).filter((video): video is PublicHelpVideo => Boolean(video));
  } catch (error) {
    if (!isMissingTable(error)) console.error("[help-videos] list failed", error);
    return [];
  }
}

// ─── Admin input ─────────────────────────────────────────────────────────────

const ROLE_VALUES = HELP_VIDEO_ROLES.map((role) => role.value) as [HelpVideoRole, ...HelpVideoRole[]];
const LANGUAGE_VALUES = HELP_VIDEO_LANGUAGES.map((lang) => lang.code) as [string, ...string[]];

const optionalUrl = z.union([z.string().trim().max(2048), z.null()]).optional().transform((value) => (value ? value : null));

export const HelpVideoInput = z.object({
  topic: z.string().trim().refine(isHelpTopic, "Pick a topic from the list."),
  title: z.string().trim().min(3, "Give the video a short title.").max(120, "Keep the title under 120 characters."),
  roles: z.array(z.enum(ROLE_VALUES)).min(1, "Pick who should see it.").max(4),
  language: z.enum(LANGUAGE_VALUES),
  videoUrl: optionalUrl,
  posterUrl: optionalUrl,
  durationSeconds: z.union([z.number().int().min(1).max(600), z.null()]).optional().transform((value) => value ?? null),
  published: z.boolean().default(false),
});
export type HelpVideoInputData = z.output<typeof HelpVideoInput>;

/** Plain reason the links can't be saved, or null. Uploaded files are checked byte by byte. */
export async function helpVideoLinkProblem(input: Pick<HelpVideoInputData, "videoUrl" | "posterUrl" | "published">): Promise<string | null> {
  const base = storageBase();
  if (input.published && !input.videoUrl) return "Add a video (upload one or paste a link) before publishing.";
  if (input.videoUrl) {
    const source = videoSource(input.videoUrl, base);
    if (!source) return "Paste a YouTube or Vimeo link, or upload an MP4 or WebM file.";
    if (source.kind === "file") {
      const problem = await storedFileProblem(source.url, "video");
      if (problem) return problem;
    }
  }
  if (input.posterUrl) {
    const own = base && input.posterUrl.startsWith(`${base}${HELP_VIDEO_FOLDER}/`) && !input.posterUrl.includes("..");
    const thumb = /^https:\/\/(i\.ytimg\.com|i\.vimeocdn\.com)\/[\w./-]+$/.test(input.posterUrl);
    if (!own && !thumb) return "Upload the poster picture here (JPG, PNG or WebP).";
    if (own) {
      const problem = await storedFileProblem(input.posterUrl, "poster");
      if (problem) return problem;
    }
  }
  return null;
}

const TYPE_BY_EXT: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const EXT_BY_TYPE: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Reads the first bytes of a file the browser uploaded straight to Storage and checks they are what the name
 * says (an .mp4 must start like an MP4). Refuses missing files too.
 */
async function storedFileProblem(url: string, kind: "video" | "poster"): Promise<string | null> {
  const ext = url.split("?")[0]!.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPE_BY_EXT[ext];
  if (!type || (kind === "video") !== type.startsWith("video/")) return kind === "video" ? "Upload an MP4 or WebM video." : "Use a JPG, PNG or WebP picture for the poster.";
  return storedBytesProblem(url, type);
}

/** Reads the first bytes of a stored public file and checks they really are `type`; refuses missing files too. */
export async function storedBytesProblem(url: string, type: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok || !response.body) return "We couldn't find that upload. Upload it again.";
    const reader = response.body.getReader();
    const head = new Uint8Array(SNIFF_BYTES);
    let filled = 0;
    while (filled < SNIFF_BYTES) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      head.set(value.subarray(0, SNIFF_BYTES - filled), filled);
      filled += Math.min(value.length, SNIFF_BYTES - filled);
    }
    await reader.cancel().catch(() => undefined);
    return uploadContentProblem(type, head.subarray(0, filled));
  } catch {
    return "We couldn't check that upload just now. Try saving again.";
  }
}

/** Removes a file we stored for a help video (best effort), when it's replaced or the video is deleted. */
export async function removeHelpFile(url: string | null | undefined) {
  const base = storageBase();
  if (!url || !base || !url.startsWith(`${base}${HELP_VIDEO_FOLDER}/`)) return;
  try {
    const supabase = await getSupabaseServiceClient();
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(base.length).split("?")[0]!)]);
  } catch {
    // Already gone; a leftover file is harmless.
  }
}

export class HelpUploadRejected extends Error {}

/**
 * A one-time signed upload URL under platform/help-videos/ (made with the service role, so storage policies
 * that only let browsers write under products/ still hold). The browser PUTs the file straight to Storage:
 * Vercel functions can't take a 50 MB body. The name comes from the checked type, never the file name.
 */
export async function signedHelpUpload(kind: "video" | "poster", type: string, size: number) {
  const base = type.toLowerCase().split(";")[0]!.trim();
  const problem = helpUploadProblem(kind, base, size);
  if (problem) throw new HelpUploadRejected(problem);
  const path = `${HELP_VIDEO_FOLDER}/${kind === "poster" ? "posters/" : ""}${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 16)}.${EXT_BY_TYPE[base]}`;
  const supabase = await getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "No signed upload URL");
  return { path, token: data.token, signedUrl: data.signedUrl, publicUrl: `${storageBase()}${path}`, contentType: base };
}
