import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { cancelUnassignedDeliveryJob } from "@/lib/logistics/booking.server";
import { cancelCarrierBooking } from "@/lib/logistics/carriers/jobs.server";

// The seller cancels one of their delivery bookings before the rider has it. A job with a company we book through
// its own API (Kwik) is cancelled with them first; any other job only while no rider is on it.
export const POST = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  const booking = await db.deliveryBooking.findFirst({ where: { id, sellerId: user.id }, select: { id: true, externalCarrier: true } });
  if (!booking) return apiError("NOT_FOUND", "Booking not found", 404);

  if (booking.externalCarrier) {
    const res = await cancelCarrierBooking(booking.id, user.id);
    if (!res.ok) return apiError(res.status === 503 ? "CARRIER_UNAVAILABLE" : res.status === 404 ? "NOT_FOUND" : "CONFLICT", res.error, res.status);
  } else if (!(await cancelUnassignedDeliveryJob(booking.id))) {
    return apiError("CONFLICT", "A rider already has this delivery, so it can't be cancelled here. Message the delivery company.", 409);
  }
  return ok(await db.deliveryBooking.findUnique({ where: { id: booking.id } }));
});
