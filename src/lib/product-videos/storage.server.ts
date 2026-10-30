import "server-only";

import { randomUUID } from "node:crypto";
import { SNIFF_BYTES, uploadContentProblem } from "@/lib/security/upload-sniff";
import { totalBytes } from "@/lib/status/status-video.server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { baseType } from "@shared/status-video";
import {
  PRODUCT_POSTER_MAX_BYTES,
  PRODUCT_VIDEO_MAX_BYTES,
  productPosterProblem,
  productVideoPath,
  productVideoProblem,
  type OwnerKind,
} from "@shared/product-videos";

// Product videos in Storage (rules in shared/product-videos.ts). Like status videos: a one-time signed upload URL
// (made with the service role, so the bucket policies that only let browsers write under products/ still hold) and the
// file goes straight from the phone or browser to the public media bucket, under product-videos/<kind>/<ownerId>/.
// Saving then reads the stored file's first bytes and size before the video is kept.

export const PRODUCT_VIDEO_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export class ProductVideoRejected extends Error {
  constructor(message: string, readonly tooBig = false) {
    super(message);
  }
}

export const VIDEO_PROBLEM_TEXT = {
  type: "Use an MP4 or MOV video.",
  empty: "That video is empty.",
  too_big: "That video is too big (max 50 MB). Pick a shorter one.",
  too_long: "Product videos can be up to 60 seconds. Trim it and try again.",
} as const;
const POSTER_TEXT = { type: "Use a JPG, PNG or WebP picture.", empty: "That picture is empty.", too_big: "That picture is too big (max 2 MB)." } as const;

/** A signed upload URL for a product video or its poster, after checking the type, size and length. */
export async function signedProductVideoUpload(owner: { kind: OwnerKind; id: string }, input: { kind: "video" | "poster"; type: string; size: number; durationMs?: number | null }) {
  const type = baseType(input.type);
  if (input.kind === "video") {
    const problem = productVideoProblem({ type, size: input.size, durationMs: input.durationMs });
    if (problem) throw new ProductVideoRejected(VIDEO_PROBLEM_TEXT[problem], problem === "too_big");
  } else {
    const problem = productPosterProblem({ type, size: input.size });
    if (problem) throw new ProductVideoRejected(POSTER_TEXT[problem], problem === "too_big");
  }
  const path = productVideoPath(owner.kind, owner.id, input.kind, type, randomUUID().replace(/-/g, ""));
  const supabase = await getSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(PRODUCT_VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "No signed upload URL");
  const { data: pub } = supabase.storage.from(PRODUCT_VIDEO_BUCKET).getPublicUrl(path);
  return { path, token: data.token, signedUrl: data.signedUrl, publicUrl: pub.publicUrl, contentType: type };
}

/**
 * Checks a stored file before a video uses it: it exists, its first bytes really are a video (or a picture for the
 * poster), and it isn't over the size cap (a signed upload URL doesn't cap the size). Null when fine.
 */
export async function storedProductVideoProblem(url: string, kind: "video" | "poster"): Promise<string | null> {
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
    const max = kind === "video" ? PRODUCT_VIDEO_MAX_BYTES : PRODUCT_POSTER_MAX_BYTES;
    if (size != null && size > max) return kind === "video" ? VIDEO_PROBLEM_TEXT.too_big : POSTER_TEXT.too_big;
    const bytes = head.subarray(0, filled);
    const types = kind === "video" ? ["video/mp4", "video/quicktime"] : ["image/jpeg", "image/png", "image/webp"];
    if (types.some((type) => uploadContentProblem(type, bytes) === null)) return null;
    return kind === "video" ? "That file isn't a video." : "That file isn't a picture.";
  } catch {
    return "We couldn't check the video just now. Try again.";
  }
}
