import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { proofFile } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Proof of delivery photo from the Riders app (X-Rider-Token header; multipart "file" and "jobId").
// Only for a job assigned to this rider that is still out for delivery.

export async function POST(req: NextRequest) {
  const session = await riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
  if (!session.ok) return apiError("UNAUTHORIZED", "This link no longer works. Ask your dispatcher for a new one.", 401);

  const form = await req.formData().catch(() => null);
  const jobId = String(form?.get("jobId") ?? "");
  const job = jobId
    ? await db.deliveryBooking.findFirst({ where: { id: jobId, riderId: session.rider.id, logisticsPartnerId: session.rider.partnerId }, select: { id: true, status: true } })
    : null;
  if (!job) return apiError("NOT_FOUND", "This job isn't assigned to you.", 404);
  if (!["confirmed", "picked_up", "in_transit", "out_for_delivery"].includes(job.status)) return apiError("CONFLICT", "This drop is already closed.", 409);

  const checked = proofFile(form);
  if (!checked.ok) return apiError("BAD_REQUEST", checked.error);
  try {
    const { publicUrl } = await uploadFileServer("brand", checked.file, uploadPath(`delivery-proofs/${session.rider.partnerId}`, checked.file));
    await db.deliveryBooking.update({ where: { id: job.id }, data: { proofUrl: publicUrl } });
    return ok({ proofUrl: publicUrl });
  } catch (error) {
    console.error("Rider proof upload failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't upload the photo. Try again.", 500);
  }
}
