import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { readPhotoDataUri } from "@/lib/kyc/identity";
import { saveSupplierPhoto, setSupplierDocStatus, updateSupplierIdentity } from "@/lib/kyc/supplier.server";
import { supplierOnboardingView } from "@/lib/kyc/supplier-onboarding.server";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { SUPPLIER_ID_TYPES, type SupplierIdType } from "@shared/supplier-onboarding";

export const runtime = "nodejs";

// "Snap a photo of your ID" (supplier onboarding): which ID it is and the photo, kept as the private "identity"
// document for the team. A NIN slip is checked against the NIN record with the selfie on the next screen
// (/api/supplier/kyc/selfie); any other ID waits for the team. A new photo sends the selfie back to the team too.
export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const idType = String(body?.idType ?? "");
  if (!(SUPPLIER_ID_TYPES as readonly string[]).includes(idType)) return apiError("BAD_REQUEST", "Pick the ID you're using.");
  const photo = readPhotoDataUri(body?.photo, "photo of your ID");
  if (!photo.ok) return apiError("BAD_REQUEST", photo.error);
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (!(await checkRateLimitShared(rateLimitKey("supplier-kyc:id", supplier.id), { maxRequests: 10, windowMs: 60 * 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many photos. Try again in an hour.", 429);
  }
  try {
    await saveSupplierPhoto(supplier.id, "identity", photo, { status: "pending", idType: idType as SupplierIdType });
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That photo isn't a picture we can read. Take it again.");
    console.error("[supplier-kyc id] upload failed", error);
    return apiError("INTERNAL_ERROR", "We couldn't save the photo. Please try again.", 500);
  }
  // A different ID means the earlier NIN result and selfie decision no longer stand for it.
  await updateSupplierIdentity(supplier.id, (current) => ({ ...current, idType: idType as SupplierIdType, ...(idType === "nin_slip" ? {} : { nin: undefined }) }));
  await setSupplierDocStatus(supplier.id, "selfie", "submitted", ["approved"]);
  return ok(await supplierOnboardingView(user.id));
});
