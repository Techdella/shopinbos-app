import "server-only";
import { db } from "@/lib/db/client";
import { updateOrderStatus } from "@/lib/orders/update-status";
import { checkTransition, makeDeliveryCode, type JobActor } from "./job-rules";
import { emitPartnerEvent } from "./webhooks";

// Server side of delivery jobs: one place that moves a job, keeps the seller's order in step and tells the
// partner's systems. Used by the partner portal, the Riders app and the partner API.

export type JobResult = { ok: true } | { ok: false; error: string };

const ORDER_STATUS_FOR_JOB: Record<string, "shipped" | "delivered" | undefined> = {
  picked_up: "shipped",
  in_transit: "shipped",
  delivered: "delivered",
};

export async function transitionJob(input: {
  bookingId: string;
  partnerId: string;
  to: string;
  actor: JobActor;
  /** Riders can only move jobs assigned to them. */
  riderId?: string;
  code?: string | null;
  failedReason?: string | null;
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

  const now = new Date();
  const data: Record<string, unknown> = { status: input.to };
  if (input.to === "confirmed" && !job.deliveryCode) data.deliveryCode = makeDeliveryCode();
  if (input.to === "confirmed" && job.status === "failed") data.failedReason = null;
  if (input.to === "picked_up") data.pickedUpAt = now;
  if (input.to === "delivered") {
    data.deliveredAt = now;
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

  // Keep the seller's order in step (shipped when picked up, delivered — and paid, for pay on delivery — when dropped off).
  const orderStatus = ORDER_STATUS_FOR_JOB[input.to];
  if (job.orderId && orderStatus) {
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
  // Supplier pickups: the supplier's order follows the rider (sent when picked up, delivered when dropped off).
  await import("@/lib/supplier-orders/pickup.server").then((pickup) => pickup.onDeliveryJobMoved(job.id, input.to)).catch(() => undefined);
  return { ok: true };
}

export async function assignRider(input: { bookingId: string; partnerId: string; riderId: string | null }): Promise<JobResult> {
  const job = await db.deliveryBooking.findFirst({ where: { id: input.bookingId, logisticsPartnerId: input.partnerId }, select: { id: true, status: true } });
  if (!job) return { ok: false, error: "We couldn't find that job. It may have been cancelled. Refresh to check." };
  if (["delivered", "cancelled"].includes(job.status)) return { ok: false, error: "This job is already finished, so it can't be changed." };
  if (input.riderId) {
    const rider = await db.logisticsTeamMember.findFirst({ where: { id: input.riderId, logisticsPartnerId: input.partnerId, status: "active" }, select: { id: true } });
    if (!rider) return { ok: false, error: "That rider is paused. Pick another rider." };
  }
  await db.deliveryBooking.update({ where: { id: job.id }, data: { riderId: input.riderId } });
  // Supplier pickups: tell the supplier which rider is coming.
  await import("@/lib/supplier-orders/pickup.server").then((pickup) => pickup.onDeliveryRiderAssigned(job.id, input.riderId)).catch(() => undefined);
  return { ok: true };
}
