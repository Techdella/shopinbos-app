import "server-only";
import { randomUUID } from "node:crypto";
import { SNIFF_BYTES, uploadContentProblem } from "@/lib/security/upload-sniff";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  STATUS_POSTER_MAX_BYTES,
  STATUS_VIDEO_MAX_BYTES,
  baseType,
  statusPosterProblem,
  statusVideoPath,
  statusVideoProblem,
} from "@shared/status-video";

// Video statuses in Storage (rules in shared/status-video.ts). The phone gets a one-time signed upload URL here and
// PUTs the file straight to the public media bucket under status/<userId>/ (made with the service role, so the
// storage policies that only let browsers write under products/ still hold, and the body never passes through a
// Vercel function). Posting then reads the stored file's first bytes and size before the post is saved.

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export class StatusVideoRejected extends Error {}

const PROBLEM_TEXT = {
  type: "Use an MP4 or MOV video.",
  empty: "That video is empty.",
  too_big: "That video is too big (max 25 MB). Pick a shorter one.",
  too_long: "Videos can be up to 30 seconds. Trim it and try again.",
} as const;
const POSTER_TEXT = { type: "Use a JPG, PNG or WebP picture.", empty: "That picture is empty.", too_big: "That picture is too big (max 2 MB)." } as const;

/** A signed upload URL for a status video or its poster, after checking the type, size and length. */
export async function signedStatusUpload(userId: string, input: { kind: "video" | "poster"; type: string; size: number; durationMs?: number | null }) {
  const type = baseType(input.type);
  if (input.kind === "video") {
    const problem = statusVideoProblem({ type, size: input.size, durationMs: input.durationMs });
    if (problem) throw new StatusVideoRejected(PROBLEM_TEXT[problem]);
  } else {
    const problem = statusPosterProblem({ type, size: input.size });
    if (problem) throw new StatusVideoRejected(POSTER_TEXT[problem]);
  }
  const path = statusVideoPath(userId, input.kind, type, randomUUID().replace(/-/g, ""));
  const supabase = await getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "No signed upload URL");
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub.publicUrl, contentType: type };
}

/** The total size from a ranged response ("bytes 0-63/123456"), else its content-length. */
export function totalBytes(headers: Headers): number | null {
  const range = headers.get("content-range");
  const total = range ? Number(range.split("/").pop()) : NaN;
  if (Number.isFinite(total) && total > 0) return total;
  const length = Number(headers.get("content-length"));
  return Number.isFinite(length) && length > 0 ? length : null;
}

/**
 * Checks a stored status file before a post uses it: it exists, its first bytes really are a video (or a picture
 * for the poster), and it isn't over the size limit (a signed upload URL doesn't cap the size). Null when fine.
 */
export async function storedStatusFileProblem(url: string, kind: "video" | "poster"): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${SNIFF_BYTES - 1}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok || !response.body) return kind === "video" ? "We couldn't find that video. Upload it again." : "We couldn't find the video's picture. Upload it again.";
    const size = totalBytes(response.headers);
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
    const max = kind === "video" ? STATUS_VIDEO_MAX_BYTES : STATUS_POSTER_MAX_BYTES;
    if (size != null && size > max) return kind === "video" ? PROBLEM_TEXT.too_big : POSTER_TEXT.too_big;
    const bytes = head.subarray(0, filled);
    const types = kind === "video" ? ["video/mp4", "video/quicktime"] : ["image/jpeg", "image/png", "image/webp"];
    if (types.some((type) => uploadContentProblem(type, bytes) === null)) return null;
    return kind === "video" ? "That file isn't a video." : "That file isn't a picture.";
  } catch {
    return "We couldn't check the video just now. Try again.";
  }
}
