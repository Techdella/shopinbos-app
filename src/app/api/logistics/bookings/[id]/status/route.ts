import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { BookingStatusUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const PATCH = withLogistics(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);

  const booking = await db.deliveryBooking.findUnique({
    where: { id: params.id, logisticsPartnerId: partner.id },
  });
  if (!booking) return apiError("NOT_FOUND", "Booking not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = BookingStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const updated = await db.deliveryBooking.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status,
      ...(parsed.data.trackingCode ? { trackingCode: parsed.data.trackingCode } : {}),
      ...(parsed.data.estimatedDelivery ? { estimatedDelivery: parsed.data.estimatedDelivery } : {}),
      ...(parsed.data.deliveredAt ? { deliveredAt: parsed.data.deliveredAt } : {}),
    },
  });

  return ok(updated);
});
