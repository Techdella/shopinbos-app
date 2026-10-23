import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { UpdateUploadRejected, signedUpdateUpload } from "@/lib/weekly-updates.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["video", "image"]), type: z.string().max(100), size: z.number().int().nonnegative() });

// POST /api/admin/updates/upload { kind: "video" | "image", type, size } → { data: { signedUrl, publicUrl, path } }
// A one-time signed upload URL in the public media bucket under platform/updates/. The browser PUTs the file to
// signedUrl (MP4/WebM up to 50 MB; JPG/PNG/WebP/GIF up to 5 MB); saving then checks the stored bytes.
export const POST = withAdmin(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Say what kind of file, its type and size.", 422);
  try {
    return NextResponse.json({ data: await signedUpdateUpload(parsed.data.kind, parsed.data.type, parsed.data.size) }, { status: 201 });
  } catch (error) {
    if (error instanceof UpdateUploadRejected) return apiError(/MB/.test(error.message) ? "FILE_TOO_LARGE" : "INVALID_FILE", error.message, /MB/.test(error.message) ? 413 : 422);
    console.error("[updates upload] signing failed", error);
    return apiError("UPLOAD_FAILED", "Storage isn't taking uploads right now. Try again, or paste a YouTube or Vimeo link.", 502);
  }
});
