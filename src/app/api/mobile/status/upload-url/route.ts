import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, created } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { StatusVideoRejected, signedStatusUpload } from "@/lib/status/status-video.server";
import { STATUS_VIDEO_UPLOADS_PER_DAY } from "@shared/status-video";
import { withStatusUser } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/mobile/status/upload-url { kind: "video" | "poster", type, size, durationMs? }
//   → { data: { signedUrl, token, path, publicUrl, contentType } }
// A one-time signed upload URL for a video status (MP4 or MOV, up to 30 seconds and 25 MB) or its poster frame
// (JPG, PNG or WebP up to 2 MB), under status/<userId>/ in the public media bucket. The phone PUTs the file straight
// to signedUrl (never through this function: Vercel refuses bodies over ~4.5 MB), then sends publicUrl as videoUrl /
// posterUrl to POST /api/mobile/status, which checks the stored bytes and size (shared/status-video.ts).

const Body = z.object({
  kind: z.enum(["video", "poster"]),
  type: z.string().trim().max(100),
  size: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().nullish(),
});

export const POST = withStatusUser(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say what kind of file, its type and size.");
  const limit = await checkRateLimitShared(rateLimitKey(`status-video-${parsed.data.kind}`, user.id), { maxRequests: STATUS_VIDEO_UPLOADS_PER_DAY, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Too many videos today. Try again tomorrow.", 429);
  try {
    return created(await signedStatusUpload(user.id, parsed.data));
  } catch (error) {
    if (error instanceof StatusVideoRejected) {
      const tooBig = /MB/.test(error.message);
      return apiError(tooBig ? "FILE_TOO_LARGE" : "BAD_REQUEST", error.message, tooBig ? 413 : 400);
    }
    console.error("[status] video upload URL failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't get the video ready to upload. Try again.", 502);
  }
});
