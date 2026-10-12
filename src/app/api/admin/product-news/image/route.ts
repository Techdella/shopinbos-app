import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { NEWS_IMAGE_MAX_BYTES } from "@/lib/email/news-image";
import { NewsImageRejected, storeNewsImage } from "@/lib/email/news-image.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Form = z.object({ file: z.instanceof(File, { message: "Attach the image as the file field" }) });

// POST /api/admin/product-news/image (multipart, field "file") — stores an image for a product news email in the
// public media bucket (platform/product-news/<uuid>.<ext>) and returns its public URL for the image field.
// JPG, PNG, WebP or GIF up to 5 MB; the bytes must match the type; wider than 1200px is scaled down.
export const POST = withAdmin(async (req: NextRequest) => {
  // Refuse obviously oversize bodies before buffering them (multipart adds a little overhead).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > NEWS_IMAGE_MAX_BYTES + 64 * 1024) return apiError("FILE_TOO_LARGE", "That image is over 5 MB. Use a smaller one.", 413);

  const form = await req.formData().catch(() => null);
  if (!form) return apiError("BAD_REQUEST", "Expected multipart/form-data", 400);
  const parsed = Form.safeParse({ file: form.get("file") });
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Attach an image", 422);

  try {
    return NextResponse.json({ data: await storeNewsImage(parsed.data.file) }, { status: 201 });
  } catch (error) {
    if (error instanceof NewsImageRejected) {
      const tooBig = /5 MB/.test(error.message);
      return apiError(tooBig ? "FILE_TOO_LARGE" : "INVALID_FILE", error.message, tooBig ? 413 : 422);
    }
    console.error("[product-news image] upload failed", error);
    return apiError("UPLOAD_FAILED", "The image couldn't be stored. Try again.", 502);
  }
});
