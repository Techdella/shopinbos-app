import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { UploadRejectedError, assertUploadContent, uploadPublicFileAt } from "@/lib/supabase/storage.server";
import { STATUS_IMAGE_MAX_BYTES, isStatusImageType, statusImagePath } from "@shared/status";
import { withStatusUser } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/mobile/status/upload (multipart "file"): a photo for a status post, from the camera or gallery. JPG,
// PNG, WebP or HEIC up to 8 MB; the bytes must match the type (the same check as every upload). Stored in the
// public media bucket under status/<userId>/ with an unguessable name; returns { url } for POST /api/mobile/status.
// The purge cron removes the photo once its post has expired.

export const POST = withStatusUser(async (req: NextRequest, { user }) => {
  const limit = await checkRateLimitShared(rateLimitKey("status-upload", user.id), { maxRequests: 30, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "Too many photos today. Try again tomorrow.", 429);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return apiError("BAD_REQUEST", "Add a photo.");
  if (!isStatusImageType(file.type)) return apiError("BAD_REQUEST", "Use a JPG, PNG or WebP photo.");
  if (file.size === 0) return apiError("BAD_REQUEST", "That photo is empty.");
  if (file.size > STATUS_IMAGE_MAX_BYTES) return apiError("BAD_REQUEST", "That photo is too big (max 8 MB).");
  try {
    await assertUploadContent(file);
    const path = statusImagePath(user.id, file.type, crypto.randomUUID().replace(/-/g, ""));
    const result = await uploadPublicFileAt(path, file);
    return ok({ url: result.publicUrl });
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That file isn't a photo.");
    console.error("Status photo upload failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't upload the photo. Try again.", 500);
  }
});
