import "server-only";
import { db } from "@/lib/db/client";
import { cancelUnassignedDeliveryJob, createDeliveryJob } from "@/lib/logistics/booking.server";
import { canOfferJob } from "@/lib/logistics/payin-deadline";
import { deliveryPartnerProblem } from "@/lib/plans/gates.server";
import { privateRateFor } from "@/lib/plans/rate-cards.server";

// The seller's delivery exceptions inbox (Growth and up, shared/plans.ts exceptionsInbox): deliveries that failed,
// are past their promised time, or haven't been accepted after a day, with a way to hand one to another partner.

const DAY = 86_400_000;

export type ExceptionReason = "failed" | "late" | "not_accepted";

export class ExceptionError extends Error {}

export function exceptionReason(booking: { status: string; estimatedDelivery: Date | null; createdAt: Date }, now = Date.now()): ExceptionReason | null {
  if (booking.status === "failed") return "failed";
  if (booking.status === "pending" && now - booking.createdAt.getTime() > DAY) return "not_accepted";
  if (["confirmed", "picked_up", "in_transit"].includes(booking.status) && booking.estimatedDelivery && booking.estimatedDelivery.getTime() < now) return "late";
  return null;
}

/** A job can go to another partner while nobody has picked it up and no money moved on it yet. */
export function canReassign(booking: { status: string; riderId: string | null; feePaidAt: Date | null; codCollected: number | null }) {
  if (booking.feePaidAt || (booking.codCollected ?? 0) > 0) return false;
  return booking.status === "failed" || (["pending", "confirmed"].includes(booking.status) && !booking.riderId);
}

export async function listDeliveryExceptions(sellerId: string) {
  const since = new Date(Date.now() - 30 * DAY);
  const rows = await db.deliveryBooking.findMany({
    where: { sellerId, createdAt: { gte: since }, status: { in: ["pending", "confirmed", "picked_up", "in_transit", "failed"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { logisticsPartner: { select: { id: true, displayName: true, whatsappNumber: true } } },
  });
  // A failed job that was already handed on isn't an exception any more.
  const handedOn = new Set(
    (await db.deliveryBooking.findMany({ where: { sellerId, notes: { startsWith: "Reassigned from " } }, select: { notes: true } })).map((row) => row.notes?.slice("Reassigned from ".length).split(" ")[0]),
  );
  return rows
    .map((booking) => ({ booking, reason: exceptionReason(booking), reassignable: canReassign(booking) }))
    .filter((row): row is typeof row & { reason: ExceptionReason } => row.reason !== null && !handedOn.has(row.booking.id));
}

/** Hands a delivery to another partner: the old job is cancelled (unless it already failed) and a new one offered. */
export async function reassignDelivery(sellerId: string, bookingId: string, partnerId: string) {
  const booking = await db.deliveryBooking.findFirst({ where: { id: bookingId, sellerId } });
  if (!booking) throw new ExceptionError("Delivery not found.");
  if (!canReassign(booking)) throw new ExceptionError("This delivery is already on its way or paid for. Contact the delivery partner instead.");
  if (partnerId === booking.logisticsPartnerId) throw new ExceptionError("Choose a different delivery partner.");
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId } });
  if (!partner || !canOfferJob({ ...partner, verificationStatus: String(partner.verificationStatus) }, { cod: Boolean(booking.codAmount) })) {
    throw new ExceptionError("That delivery partner can't take this job right now. Choose another one.");
  }
  const planProblem = await deliveryPartnerProblem(sellerId, partner.id);
  if (planProblem) throw new ExceptionError(planProblem);
  if (booking.status !== "failed" && !(await cancelUnassignedDeliveryJob(booking.id))) {
    throw new ExceptionError("A rider has just taken this delivery, so it can't be moved.");
  }
  const privateRate = await privateRateFor(sellerId, partner.id, booking.destination);
  return createDeliveryJob({
    sellerId,
    logisticsPartnerId: partner.id,
    orderId: booking.orderId,
    pickupLocation: booking.pickupLocation,
    destination: booking.destination,
    packageDetails: booking.packageDetails as never,
    deliveryFee: privateRate ?? (partner.basePrice > 0 ? partner.basePrice : booking.deliveryFee),
    currency: booking.currency,
    codAmount: booking.codAmount,
    notes: `Reassigned from ${booking.id}`,
    pickupWindowStart: booking.pickupWindowStart,
    pickupWindowEnd: booking.pickupWindowEnd,
  });
}
