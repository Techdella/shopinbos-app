import { NextRequest } from "next/server";
import { z } from "zod";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { BookingStatusUpdateSchema } from "@/lib/schemas";
import { transitionJob } from "@/lib/logistics/jobs";
import type { AuthUser } from "@/lib/auth/types";

// Moves a job through the same rules as the portal, the Riders app and the partner API (src/lib/logistics/jobs.ts):
// allowed steps only, a reason to fail or decline, the step's timestamps, the seller's order and notifications.
const Body = BookingStatusUpdateSchema.extend({
  reason: z.string().max(300).optional(),
  code: z.string().max(10).optional(),
});

export const PATCH = withLogistics(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const input = parsed.data;
  const moved = await transitionJob({
    bookingId: params.id,
    partnerId: partner.id,
    to: input.status,
    actor: "partner",
    code: input.code,
    failedReason: input.status === "failed" ? input.reason : null,
    declineReason: input.status === "declined" ? input.reason : null,
    trackingCode: input.trackingCode,
  });
  if (!moved.ok) return apiError("CONFLICT", moved.error, 409);
  if (input.estimatedDelivery) await db.deliveryBooking.update({ where: { id: params.id }, data: { estimatedDelivery: input.estimatedDelivery } });

  return ok(await db.deliveryBooking.findUnique({ where: { id: params.id } }));
});
