import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";
import { extractReviewFromImage, type ImageMediaType } from "@/lib/reviews/extract";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES = new Set<ImageMediaType>(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

// POST (multipart, field "file"): stores the screenshot and, when an AI key is set, reads the customer's
// name, rating and words off it. Returns a draft only; the seller confirms it in the import form.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("BAD_REQUEST", "Add a screenshot.");
  if (!TYPES.has(file.type as ImageMediaType)) return apiError("BAD_REQUEST", "Use a JPG, PNG or WebP screenshot.");
  if (file.size > MAX_BYTES) return apiError("BAD_REQUEST", "That screenshot is larger than 8 MB.");

  let imageUrl: string;
  try {
    imageUrl = (await uploadFileServer("products", file, uploadPath(`reviews/${store.id}/imports`, file))).publicUrl;
  } catch (error) {
    console.error("[reviews] screenshot upload failed", error);
    return apiError("UPLOAD_FAILED", "We couldn't save that screenshot. Try again.", 500);
  }

  if (!aiConfigured()) {
    return NextResponse.json({ data: { imageUrl, draft: null, read: false, reason: "AI reading needs OPENAI_API_KEY or ANTHROPIC_API_KEY. Type the review in below." } });
  }
  const limited = await meterAi(user.id, "text");
  if (limited) return NextResponse.json({ data: { imageUrl, draft: null, read: false, reason: "You've used today's AI allowance. Type the review in below." } });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const { draft, read } = await extractReviewFromImage({ base64, mediaType: file.type as ImageMediaType });
  return NextResponse.json({
    data: { imageUrl, draft: read ? draft : null, read, reason: read ? null : "We couldn't read this screenshot. Type the review in below." },
  });
});
