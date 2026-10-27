import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { isDeliveryMethod } from "@shared/partner-tiers";
import { cleanPlate } from "@/lib/logistics/partner-kyc";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { stateResponse, withKycPartner } from "../../_partner";
import { removeVehicleFiles, storeVehicleFile, vehicleFileProblem } from "../_files";

export const runtime = "nodejs";

async function ownVehicle(partnerId: string, params: Promise<{ id: string }>) {
  const { id } = await params;
  return db.logisticsVehicle.findFirst({ where: { id, logisticsPartnerId: partnerId } });
}

// Fix a vehicle the team rejected (or one still waiting): new details and/or photos; it goes back to "pending".
export const POST = withKycPartner(async (req, { partner, params }) => {
  const vehicle = await ownVehicle(partner.id, params);
  if (!vehicle) return apiError("NOT_FOUND", "We couldn't find that vehicle.", 404);
  if (vehicle.status === "approved") return apiError("CONFLICT", "This vehicle is already approved. Add a new one instead.", 409);
  const form = await req.formData().catch(() => null);
  if (!form) return apiError("BAD_REQUEST", "Add the vehicle's details and photos.");
  const type = form.get("type");
  const plateRaw = form.get("plateNumber");
  const plate = plateRaw ? cleanPlate(plateRaw) : vehicle.plateNumber;
  if (type !== null && !isDeliveryMethod(type)) return apiError("BAD_REQUEST", "Pick the type of vehicle.");
  if (!plate) return apiError("BAD_REQUEST", "Type the plate number.");
  const photo = form.get("photo");
  const licence = form.get("licence");
  const problem = (photo ? vehicleFileProblem(photo, "vehicle photo", false) : null) ?? (licence ? vehicleFileProblem(licence, "licence", true) : null);
  if (problem) return apiError("BAD_REQUEST", problem);
  const stored: { photoPath?: string; licencePath?: string } = {};
  try {
    if (photo) stored.photoPath = await storeVehicleFile(partner.id, photo as File);
    if (licence) stored.licencePath = await storeVehicleFile(partner.id, licence as File);
    await db.logisticsVehicle.update({
      where: { id: vehicle.id },
      data: { ...(type ? { type: type as string } : {}), plateNumber: plate, ...stored, status: "pending", rejectionReason: null, reviewedAt: null },
    });
  } catch (error) {
    await removeVehicleFiles([stored.photoPath, stored.licencePath]);
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", error.message);
    console.error("[partner-kyc vehicle] re-upload failed", error);
    return apiError("INTERNAL_ERROR", "Upload failed. Please try again.", 500);
  }
  // Only drop the old files once the new ones are saved.
  await removeVehicleFiles([stored.photoPath ? vehicle.photoPath : null, stored.licencePath ? vehicle.licencePath : null]);
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});

export const DELETE = withKycPartner(async (_req, { partner, params }) => {
  const vehicle = await ownVehicle(partner.id, params);
  if (!vehicle) return apiError("NOT_FOUND", "We couldn't find that vehicle.", 404);
  await db.logisticsVehicle.delete({ where: { id: vehicle.id } });
  await removeVehicleFiles([vehicle.photoPath, vehicle.licencePath]);
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id);
});
