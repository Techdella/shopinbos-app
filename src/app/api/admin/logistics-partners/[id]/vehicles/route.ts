import { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";

// The team approves or rejects one of a partner's vehicles (photo + driver's/rider's licence). Tier 1 needs one
// approved vehicle; a rejection needs a reason the partner sees next to the re-upload button.
const Schema = z.discriminatedUnion("action", [
  z.object({ vehicleId: z.string().min(1), action: z.literal("approve") }),
  z.object({ vehicleId: z.string().min(1), action: z.literal("reject"), reason: z.string().trim().min(3, "Say what they need to fix.").max(300) }),
]);

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");

  const vehicle = await db.logisticsVehicle.findFirst({ where: { id: parsed.data.vehicleId, logisticsPartnerId: id }, select: { id: true } });
  if (!vehicle) return apiError("NOT_FOUND", "Vehicle not found", 404);

  const updated = await db.logisticsVehicle.update({
    where: { id: vehicle.id },
    data: parsed.data.action === "approve"
      ? { status: "approved", rejectionReason: null, reviewedAt: new Date() }
      : { status: "rejected", rejectionReason: parsed.data.reason, reviewedAt: new Date() },
  });
  const tier = await refreshPartnerTier(id);
  revalidatePath(`/admin/logistics-partners/${id}`);
  return ok({ vehicle: updated, tier });
});
