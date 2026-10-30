import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, created } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { ProductVideoRejected, signedProductVideoUpload } from "@/lib/product-videos/storage.server";
import { PRODUCT_VIDEO_UPLOADS_PER_DAY } from "@shared/product-videos";
import { withVideoOwner } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/product-videos/upload-url { kind: "video" | "poster", type, size, durationMs? }
//   → { data: { signedUrl, token, path, publicUrl, contentType } }
// A one-time signed upload URL for a product video (MP4 or MOV, up to 60 seconds and 50 MB) or its poster frame (JPG,
// PNG or WebP up to 2 MB), under product-videos/<store|supplier>/<ownerId>/ in the public media bucket. The phone or
// browser PUTs the file straight to signedUrl (never through this function: Vercel refuses bodies over ~4.5 MB), then
// sends publicUrl as videoUrl / posterUrl to POST /api/app/product-videos, which checks the stored bytes and size.
// Sellers and suppliers with post_to_plug on (shared/product-videos.ts).

const Body = z.object({
  kind: z.enum(["video", "poster"]),
  type: z.string().trim().max(100),
  size: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().nullish(),
});

export const POST = withVideoOwner(async (req: NextRequest, { user, owner }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say what kind of file, its type and size.");
  const limit = await checkRateLimitShared(rateLimitKey(`product-video-${parsed.data.kind}`, user.id), { maxRequests: PRODUCT_VIDEO_UPLOADS_PER_DAY, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Too many videos today. Try again tomorrow.", 429);
  try {
    return created(await signedProductVideoUpload(owner, parsed.data));
  } catch (error) {
    if (error instanceof ProductVideoRejected) return apiError(error.tooBig ? "FILE_TOO_LARGE" : "BAD_REQUEST", error.message, error.tooBig ? 413 : 400);
    console.error("[product-videos] upload URL failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't get the video ready to upload. Try again.", 502);
  }
});
