import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { riderFromToken } from "@/lib/logistics/rider-session";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { proofFile } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Photos from the Riders app (X-Rider-Token header; multipart "file", "jobId" and "kind"). Only for a job assigned to
// this rider that is still open.
//   kind "handover" (the default): the sealed parcel as it's handed over, needed to close every drop.
//   kind "pickup": the sealed parcel as the rider takes it from the shop or supplier, needed before "Got the parcel".
// The photos of the sealed parcel decide most disputes (shared/fault-matrix.ts).

export async function POST(req: NextRequest) {
  const session = await riderFromToken(req.headers.get("x-rider-token")?.trim() ?? "");
  if (!session.ok) return apiError("UNAUTHORIZED", "This link no longer works. Ask your dispatcher for a new one.", 401);

  const form = await req.formData().catch(() => null);
  const jobId = String(form?.get("jobId") ?? "");
  const pickup = String(form?.get("kind") ?? "") === "pickup";
  const job = jobId
    ? await db.deliveryBooking.findFirst({ where: { id: jobId, riderId: session.rider.id, logisticsPartnerId: session.rider.partnerId }, select: { id: true, status: true } })
    : null;
  if (!job) return apiError("NOT_FOUND", "This job isn't assigned to you.", 404);
  if (pickup ? job.status !== "confirmed" : !["confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point"].includes(job.status)) {
    return apiError("CONFLICT", pickup ? "This parcel is already picked up." : "This drop is already closed.", 409);
  }

  const checked = proofFile(form);
  if (!checked.ok) return apiError("BAD_REQUEST", checked.error);
  try {
    const { publicUrl } = await uploadFileServer("brand", checked.file, uploadPath(`delivery-proofs/${session.rider.partnerId}`, checked.file));
    await db.deliveryBooking.update({ where: { id: job.id }, data: pickup ? { pickupPhotoUrl: publicUrl, pickupPhotoAt: new Date() } : { proofUrl: publicUrl } });
    return ok(pickup ? { pickupPhotoUrl: publicUrl } : { proofUrl: publicUrl });
  } catch (error) {
    console.error("Rider proof upload failed", error);
    return apiError("UPLOAD_FAILED", "Couldn't upload the photo. Try again.", 500);
  }
}
