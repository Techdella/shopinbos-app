import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { supplierForUser } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Product photos from the supplier app's camera or gallery (multipart "file"). Returns the public URL that
// POST /api/supplier/products takes in `images`. (/api/upload is for sellers only.)

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return apiError("BAD_REQUEST", "Add a photo.");
  if (!TYPES.has(file.type)) return apiError("BAD_REQUEST", "Use a JPG, PNG or WebP photo.");
  if (file.size > MAX_BYTES) return apiError("BAD_REQUEST", "That photo is too big (max 10 MB).");
  try {
    const result = await uploadFileServer("supplier-product-images", file, uploadPath(`supplier-product-images/${supplier.id}`, file));
    return ok({ url: result.publicUrl });
  } catch (error) {
    console.error("Supplier photo upload failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't upload the photo. Try again.", 500);
  }
});
