import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { isDeliveryMethod } from "@shared/partner-tiers";
import { cleanPlate } from "@/lib/logistics/partner-kyc";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";
import { stateResponse, withKycPartner } from "../_partner";
import { removeVehicleFiles, storeVehicleFile, vehicleFileProblem } from "./_files";

export const runtime = "nodejs";

const MAX_VEHICLES = 20;

// Vehicles step: add a vehicle (multipart: type, plate, photo, licence). The team checks each one.
export const POST = withKycPartner(async (req, { partner }) => {
  const form = await req.formData().catch(() => null);
  if (!form) return apiError("BAD_REQUEST", "Add the vehicle's details and photos.");
  const type = form.get("type");
  const plate = cleanPlate(form.get("plateNumber"));
  if (!isDeliveryMethod(type)) return apiError("BAD_REQUEST", "Pick the type of vehicle.");
  if (!plate) return apiError("BAD_REQUEST", "Type the plate number.");
  const photo = form.get("photo");
  const licence = form.get("licence");
  const problem = vehicleFileProblem(photo, "vehicle photo", false) ?? vehicleFileProblem(licence, "licence", true);
  if (problem) return apiError("BAD_REQUEST", problem);
  if ((await db.logisticsVehicle.count({ where: { logisticsPartnerId: partner.id } })) >= MAX_VEHICLES) {
    return apiError("BAD_REQUEST", `You can add up to ${MAX_VEHICLES} vehicles here. Remove one first.`);
  }
  const stored: string[] = [];
  try {
    stored.push(await storeVehicleFile(partner.id, photo as File));
    stored.push(await storeVehicleFile(partner.id, licence as File));
    await db.logisticsVehicle.create({ data: { logisticsPartnerId: partner.id, type, plateNumber: plate, photoPath: stored[0], licencePath: stored[1] } });
  } catch (error) {
    await removeVehicleFiles(stored);
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", error.message);
    console.error("[partner-kyc vehicle] upload failed", error);
    return apiError("INTERNAL_ERROR", "Upload failed. Please try again.", 500);
  }
  await refreshPartnerTier(partner.id);
  return stateResponse(partner.id, 201);
});
