import { payAtDoorBlock } from "@shared/pay-at-door";
import "server-only";
import { db } from "@/lib/db/client";
import { updateOrderStatus } from "@/lib/orders/update-status";
import { checkTransition, makeDeliveryCode, makePickupCode, riderPayFor, type JobActor } from "./job-rules";
import { emitPartnerEvent } from "./webhooks";
import { notifyJobMoved, notifyRiderAssigned } from "@/lib/notifications/events.server";
import { canTakeHighValue } from "@shared/partner-reach";

// Server side of delivery jobs: one place that moves a job, keeps the seller's order in step and tells the
// partner's systems. Used by the partner portal, the Riders app and the partner API.

export type JobResult = { ok: true } | { ok: false; error: string };

const ORDER_STATUS_FOR_JOB: Record<string, "shipped" | "delivered" | undefined> = {
  picked_up: "shipped",
  in_transit: "shipped",
  out_for_delivery: "shipped",
  at_pickup_point: "shipped",
  delivered: "delivered",
};

/** Job steps that send the buyer a delivery update (src/lib/notifications/delivery-messages.ts deliveryEventFor). */
const DELIVERY_STAGE_MESSAGES = new Set(["confirmed", "out_for_delivery", "at_pickup_point", "failed", "returning"]);

export async function transitionJob(input: {
  bookingId: string;
  partnerId: string;
  to: string;
  actor: JobActor;
  /** Riders can only move jobs assigned to them. */
  riderId?: string;
  code?: string | null;
  /** Who took the parcel (a rider closing a drop with a proof photo instead of the customer's code). */
  recipientName?: string | null;
  failedReason?: string | null;
  /** Why the partner can't take a new job (logistics marketplace). */
  declineReason?: string | null;
  codCollected?: number | null;
  codMethod?: string | null;
  proofUrl?: string | null;
  trackingCode?: string | null;
}): Promise<JobResult> {
  const job = await db.deliveryBooking.findFirst({ where: { id: input.bookingId, logisticsPartnerId: input.partnerId } });
  if (!job) return { ok: false, error: "We couldn't find that job. It may have been cancelled. Refresh to check." };
  if (input.riderId && job.riderId !== input.riderId) return { ok: false, error: "This job isn't assigned to you." };

  const check = checkTransition(job, input);
  if (!check.ok) return check;
  // Pay on delivery: no payment, no drop (shared/pay-at-door.ts). Whoever closes it: rider, partner portal or API.
  if (input.to === "delivered" && job.orderId) {
    const order = await db.retailOrder.findUnique({ where: { id: job.orderId }, select: { paymentMethod: true, status: true, paystackStatus: true } });
    const blocked = payAtDoorBlock(order, job);
    if (blocked) return { ok: false, error: blocked };
  }
  // High-value parcels (shared/partner-reach.ts): only a Top partner (Tier 3) can accept one.
  if (input.to === "confirmed" && job.highValue && !job.acceptedAt) {
    const partner = await db.logisticsPartner.findUnique({ where: { id: input.partnerId }, select: { level: true } });
    if (!canTakeHighValue(partner?.level)) return { ok: false, error: "This is a high-value parcel. Only Top partners (Tier 3) can take it, so decline it and the shop will send it to another partner." };
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: input.to };
  if (input.to === "confirmed" && !job.deliveryCode) data.deliveryCode = makeDeliveryCode();
  // The shop gives the rider this one at pickup (the Riders app asks for it before "picked up").
  if (input.to === "confirmed" && !job.pickupCode) data.pickupCode = makePickupCode((data.deliveryCode as string | undefined) ?? job.deliveryCode);
  if (input.to === "confirmed" && job.status === "failed") data.failedReason = null;
  if (input.to === "confirmed" && !job.acceptedAt) data.acceptedAt = now;
  if (input.to === "declined") {
    data.declinedAt = now;
    data.declineReason = input.declineReason?.trim().slice(0, 300);
  }
  if (input.to === "picked_up") data.pickedUpAt = now;
  if (input.to === "out_for_delivery") data.outForDeliveryAt = now;
  if (input.to === "at_pickup_point") data.atPickupPointAt = now;
  if (input.to === "returned") data.returnedAt = now;
  if (input.to === "failed") data.failedAttempts = { increment: 1 };
  if (input.to === "delivered") {
    data.deliveredAt = now;
    // The rider's earnings for this job, fixed now so a later pay change doesn't rewrite it.
    if (job.riderId && job.riderPay === null) {
      const rider = await db.logisticsTeamMember.findUnique({ where: { id: job.riderId }, select: { payType: true, payRate: true } });
      const pay = riderPayFor(rider, job);
      if (pay !== null) data.riderPay = pay;
    }
    if (job.codAmount && job.codAmount > 0) {
      data.codCollected = input.codCollected;
      data.codMethod = input.codMethod;
      data.codCollectedAt = now;
    }
  }
  if (input.to === "failed") data.failedReason = input.failedReason?.trim().slice(0, 300);
  if (input.proofUrl) data.proofUrl = input.proofUrl;
  if (input.trackingCode) data.trackingCode = input.trackingCode;
  await db.deliveryBooking.update({ where: { id: job.id }, data });
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.rewardJobMoved(job.id, input.to)).catch(() => undefined);
  // A delivered job counts towards the partner's tier (Tier 1 Verified → Tier 2 Trusted → Tier 3 Top partner).
  if (input.to === "delivered") void import("./partner-levels.server").then((levels) => levels.refreshPartnerLevel(input.partnerId)).catch(() => undefined);

  // Keep the seller's order in step (shipped when picked up, delivered — and paid, for pay on delivery — when dropped off).
  // A supplier's pickup is one parcel of the order: its supplier order moves (onDeliveryJobMoved below) and the
  // order follows all its parcels. The seller's own job on an order that also has supplier parcels is the seller's
  // part (markOwnPart, through updateOrderStatus).
  const orderStatus = ORDER_STATUS_FOR_JOB[input.to];
  const supplierPickup = job.orderId && orderStatus ? await db.supplierPickup.findUnique({ where: { deliveryBookingId: job.id }, select: { id: true } }) : null;
  if (job.orderId && orderStatus && !supplierPickup) {
    const order = await db.retailOrder.findUnique({ where: { id: job.orderId } });
    const store = order ? await db.store.findUnique({ where: { id: order.storeId }, select: { id: true, name: true } }) : null;
    if (order && store && order.status !== orderStatus && order.status !== "delivered" && order.status !== "cancelled") {
      if (orderStatus === "delivered" && (order.status === "pending" || order.status === "awaiting_payment") && job.codAmount && (input.codCollected ?? 0) > 0) {
        await db.retailOrder.update({ where: { id: order.id }, data: { paymentMethod: "pay_on_delivery" } }).catch(() => null);
      }
      await updateOrderStatus(store, order, { status: orderStatus }).catch(() => null);
    }
  }

  void emitPartnerEvent(input.partnerId, input.to === "cancelled" ? "job.cancelled" : "job.updated", { id: job.id, status: input.to, actor: input.actor }).catch(() => undefined);
  // The seller hears about pickups, deliveries, problems and cash collected; the rider about a cancelled job.
  await notifyJobMoved({ bookingId: job.id, to: input.to, actor: input.actor, codCollected: input.codCollected });
  // The buyer: WhatsApp/SMS at the delivery stages the seller switched on (booked, out for delivery with the code,
  // at the pickup point, a problem). Delivered is the order's own message, sent above through updateOrderStatus.
  if (job.orderId && DELIVERY_STAGE_MESSAGES.has(input.to)) {
    await import("@/lib/notifications/customer-messages").then((messages) => messages.notifyDeliveryStage(job.id, input.to)).catch(() => undefined);
  }
  // Supplier pickups: the supplier's order follows the rider (sent when picked up, delivered when dropped off).
  await import("@/lib/supplier-orders/pickup.server").then((pickup) => pickup.onDeliveryJobMoved(job.id, input.to)).catch(() => undefined);
  return { ok: true };
}

/**
 * The pickup code for a job the shop is about to hand over. Jobs accepted before pickup codes existed get one the
 * first time the shop's screen asks (only while the job waits for the rider). null when there's nothing to show.
 */
export async function ensurePickupCode(job: { id: string; status: string; pickupCode: string | null; deliveryCode: string | null }): Promise<string | null> {
  if (job.status !== "confirmed") return null;
  if (job.pickupCode) return job.pickupCode;
  // Only fills an empty code, so two screens loading at once end up showing the same one.
  await db.deliveryBooking.updateMany({ where: { id: job.id, pickupCode: null }, data: { pickupCode: makePickupCode(job.deliveryCode) } });
  const saved = await db.deliveryBooking.findUnique({ where: { id: job.id }, select: { pickupCode: true } });
  return saved?.pickupCode ?? null;
}

export async function assignRider(input: { bookingId: string; partnerId: string; riderId: string | null }): Promise<JobResult> {
  const job = await db.deliveryBooking.findFirst({ where: { id: input.bookingId, logisticsPartnerId: input.partnerId }, select: { id: true, status: true, riderId: true } });
  if (!job) return { ok: false, error: "We couldn't find that job. It may have been cancelled. Refresh to check." };
  if (["delivered", "cancelled"].includes(job.status)) return { ok: false, error: "This job is already finished, so it can't be changed." };
  if (input.riderId) {
    const rider = await db.logisticsTeamMember.findFirst({ where: { id: input.riderId, logisticsPartnerId: input.partnerId, status: "active" }, select: { id: true } });
    if (!rider) return { ok: false, error: "That rider is inactive. Pick an active rider." };
  }
  await db.deliveryBooking.update({ where: { id: job.id }, data: { riderId: input.riderId } });
  // Push to the rider's phone (and to the rider who had it before).
  await notifyRiderAssigned({ bookingId: job.id, riderId: input.riderId, previousRiderId: job.riderId });
  // Supplier pickups: tell the supplier which rider is coming.
  await import("@/lib/supplier-orders/pickup.server").then((pickup) => pickup.onDeliveryRiderAssigned(job.id, input.riderId)).catch(() => undefined);
  return { ok: true };
}
