import "server-only";

import { randomUUID } from "node:crypto";
import { SNIFF_BYTES } from "@/lib/security/upload-sniff";
import { uploadPublicFileAt } from "@/lib/supabase/storage.server";
import { NEWS_IMAGE_MAX_BYTES, newsImagePath, newsImageProblem, newsImageResize, type NewsImageType } from "./news-image";

// Stores an image for a product news email in the public media bucket (shopinbos-media,
// platform/product-news/<uuid>.<ext>) with the service role, after checking its bytes, and scales wide ones down
// to 1200px with sharp so emails stay light.

export class NewsImageRejected extends Error {}

export interface StoredNewsImage {
  url: string;
  path: string;
  type: NewsImageType;
  bytes: number;
  width: number | null;
  height: number | null;
  resized: boolean;
}

type Sharp = (typeof import("sharp"))["default"];

/** sharp ships with Next.js (image optimisation); if it can't load here the image is stored as uploaded. */
async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch (error) {
    console.warn("[product-news image] sharp unavailable, storing the original", error instanceof Error ? error.message : error);
    return null;
  }
}

async function scale(bytes: Buffer, type: NewsImageType) {
  const sharp = await loadSharp();
  if (!sharp) return { bytes, width: null, height: null, resized: false };
  let meta: { width?: number; height?: number };
  try {
    meta = await sharp(bytes, { animated: type === "image/gif" }).metadata();
  } catch {
    // The signature matched but the image doesn't decode: it would show broken in every inbox.
    throw new NewsImageRejected("That image looks damaged. Export it again and retry.");
  }
  const target = newsImageResize(meta.width, type);
  if (!target) return { bytes, width: meta.width ?? null, height: meta.height ?? null, resized: false };
  // rotate() applies the EXIF orientation before metadata is dropped (sharp strips it by default).
  let pipeline = sharp(bytes).rotate().resize({ width: target.width, withoutEnlargement: true });
  if (type === "image/jpeg") pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
  else if (type === "image/png") pipeline = pipeline.png({ compressionLevel: 9 });
  else if (type === "image/webp") pipeline = pipeline.webp({ quality: 82 });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height, resized: true };
}

export async function storeNewsImage(file: File): Promise<StoredNewsImage> {
  const type = file.type.toLowerCase();
  const early = newsImageProblem({ type, size: file.size });
  if (early) throw new NewsImageRejected(early);
  const original = Buffer.from(await file.arrayBuffer());
  const problem = newsImageProblem({ type, size: original.byteLength, head: original.subarray(0, SNIFF_BYTES) });
  if (problem) throw new NewsImageRejected(problem);

  const t = type as NewsImageType;
  const out = await scale(original, t);
  if (out.bytes.byteLength > NEWS_IMAGE_MAX_BYTES) throw new NewsImageRejected("That image is still over 5 MB. Use a smaller one.");
  const path = newsImagePath(t, randomUUID());
  const stored = await uploadPublicFileAt(path, new Blob([new Uint8Array(out.bytes)], { type: t }));
  return { url: stored.publicUrl, path: stored.path, type: t, bytes: out.bytes.byteLength, width: out.width, height: out.height, resized: out.resized };
}
