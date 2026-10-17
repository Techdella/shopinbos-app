import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { listMedia, MediaRejectedError, syncLibrary, uploadToLibrary } from "@/lib/media/library.server";
import { cleanDimension, parseMediaQuery } from "@shared/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The signed-in person's media library (sellers, suppliers, logistics partners and admins each see only their own).
//   GET  ?q=&kind=image|video&page=&limit=   → { data: MediaAsset[], meta: { page, limit, total, hasMore } }
//   POST multipart file=<image|video> [width, height, only=image]   → { data: MediaAsset }
// Removing one: DELETE /api/app/media/[id] (hides it; the file stays for pages that use it).

export const GET = withAuth(async (req, { user }) => {
  const query = parseMediaQuery(req.nextUrl.searchParams);
  // Pictures already in the store (product photos, logo, editor images) join the library when it opens.
  if (query.page === 1) await syncLibrary(user.id);
  try {
    const { rows, total } = await listMedia(user.id, query);
    return NextResponse.json({ data: rows, meta: { page: query.page, limit: query.limit, total, hasMore: query.page * query.limit < total } });
  } catch (error) {
    console.error("[media] list failed", error);
    // Before the migration has run the library is simply empty; uploading still works.
    return NextResponse.json({ data: [], meta: { page: query.page, limit: query.limit, total: 0, hasMore: false } });
  }
});

export const POST = withAuth(async (req, { user }) => {
  if (!checkRateLimit(`media-upload:${user.id}`, { maxRequests: 40, windowMs: 60_000 }).allowed) {
    return apiError("RATE_LIMITED", "Too many uploads. Wait a minute and try again.", 429);
  }
  const form = await req.formData().catch(() => null);
  if (!form) return apiError("BAD_REQUEST", "Expected multipart/form-data", 400);
  const file = form.get("file");
  if (!(file instanceof File)) return apiError("BAD_REQUEST", "Choose a file to upload.", 400);
  try {
    const asset = await uploadToLibrary(user.id, file, {
      width: cleanDimension(form.get("width")),
      height: cleanDimension(form.get("height")),
      allow: form.get("only") === "image" ? "image" : "any",
    });
    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaRejectedError || error instanceof UploadRejectedError) return apiError("BAD_REQUEST", error.message, 400);
    console.error("[media] upload failed", error);
    return apiError("UPLOAD_FAILED", "That upload didn't go through. Try again.", 500);
  }
});
