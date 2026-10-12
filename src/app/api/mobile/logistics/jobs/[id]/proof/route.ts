import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { partnerForUser, proofFile } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proof of delivery photo for one of the partner's open jobs (multipart "file"). Same column the partner API's
// POST /v1/partner/jobs/[id]/proof fills.

export const POST = withLogistics(async (req: NextRequest, { user, params }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const job = await db.deliveryBooking.findFirst({ where: { id: String(params.id), logisticsPartnerId: partner.id }, select: { id: true, status: true } });
  if (!job) return apiError("NOT_FOUND", "Job not found", 404);
  if (!["confirmed", "picked_up", "in_transit", "delivered"].includes(job.status)) return apiError("CONFLICT", "This job isn't out for delivery.", 409);

  const checked = proofFile(await req.formData().catch(() => null));
  if (!checked.ok) return apiError("BAD_REQUEST", checked.error);
  try {
    const { publicUrl } = await uploadFileServer("brand", checked.file, uploadPath(`delivery-proofs/${partner.id}`, checked.file));
    await db.deliveryBooking.update({ where: { id: job.id }, data: { proofUrl: publicUrl } });
    return ok({ proofUrl: publicUrl });
  } catch (error) {
    console.error("Proof upload failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't upload the photo. Try again.", 500);
  }
});
