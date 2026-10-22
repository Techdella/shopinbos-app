import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { supplierForUser } from "../_shared";
import { recordMedia } from "@/lib/media/library.server";
import { UPLOAD_MAX_BYTES } from "@shared/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Product photos from the supplier app's camera or gallery (multipart "file"). Returns the public URL that
// POST /api/supplier/products takes in `images`. (/api/upload is for sellers only.)

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
// Requests over about 4.5 MB never reach the route on Vercel; the app sends photos at 70% quality.
const MAX_BYTES = UPLOAD_MAX_BYTES;

export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return apiError("BAD_REQUEST", "Add a photo.");
  if (!TYPES.has(file.type)) return apiError("BAD_REQUEST", "Use a JPG, PNG or WebP photo.");
  if (file.size > MAX_BYTES) return apiError("BAD_REQUEST", "That photo is too big (max 4 MB). Take it again or choose a smaller one.");
  try {
    const result = await uploadFileServer("supplier-product-images", file, uploadPath(`supplier-product-images/${supplier.id}`, file));
    // Also in the supplier's media library, to pick again on the web ("Choose from my media").
    await recordMedia({ userId: user.id, storeId: null, url: result.publicUrl, path: result.path, kind: "image", bytes: file.size, source: "product" });
    return ok({ url: result.publicUrl });
  } catch (error) {
    console.error("Supplier photo upload failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't upload the photo. Try again.", 500);
  }
});
