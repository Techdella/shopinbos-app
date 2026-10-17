import "server-only";
import type { Prisma } from "@prisma/client";
import { ownPartCollect } from "@shared/cod-split";
import { db } from "@/lib/db/client";
import { partnerJob } from "./partner-api-core";
import { emitPartnerEvent } from "./webhooks";
import { notifyJobOffered } from "@/lib/notifications/events.server";

// Creating a delivery job for a partner, the same way POST /api/app/logistics/bookings does (save it, then offer
// it to the partner's systems as "job.offered"). Used for supplier pickups (src/lib/supplier-orders/pickup.server.ts),
// which also carry a pickup window.

/**
 * What the rider collects at the door for one of the seller's orders: unpaid (pay-on-delivery) orders only. When
 * suppliers send some of the lines, this parcel collects only the seller's own lines' share, so the customer never
 * pays the total twice. Undefined when nothing is collected.
 */
export async function orderCollectAmount(sellerId: string, orderId: string | null | undefined) {
  if (!orderId) return undefined;
  const order = await db.retailOrder.findFirst({
    where: { id: orderId, store: { userId: sellerId } },
    select: { total: true, status: true, items: true, supplierOrders: { select: { items: true } } },
  });
  if (!order || (order.status !== "pending" && order.status !== "awaiting_payment")) return undefined;
  const ownShare = ownPartCollect(order.items, order.total, order.supplierOrders.map((part) => part.items));
  return ownShare > 0 ? ownShare : undefined;
}

export interface DeliveryJobInput {
  sellerId: string;
  logisticsPartnerId: string;
  orderId?: string | null;
  pickupLocation: string;
  destination: string;
  packageDetails: Prisma.InputJsonValue;
  deliveryFee: number;
  currency?: string;
  codAmount?: number | null;
  notes?: string | null;
  pickupWindowStart?: Date | null;
  pickupWindowEnd?: Date | null;
}

export async function createDeliveryJob(input: DeliveryJobInput) {
  const booking = await db.deliveryBooking.create({
    data: {
      sellerId: input.sellerId,
      logisticsPartnerId: input.logisticsPartnerId,
      orderId: input.orderId ?? null,
      pickupLocation: input.pickupLocation,
      destination: input.destination,
      packageDetails: input.packageDetails,
      deliveryFee: input.deliveryFee,
      currency: input.currency ?? "NGN",
      codAmount: input.codAmount && input.codAmount > 0 ? input.codAmount : null,
      notes: input.notes ?? null,
      pickupWindowStart: input.pickupWindowStart ?? null,
      pickupWindowEnd: input.pickupWindowEnd ?? null,
    },
  });
  void emitPartnerEvent(booking.logisticsPartnerId, "job.offered", partnerJob(booking)).catch(() => undefined);
  await notifyJobOffered({ bookingId: booking.id, logisticsPartnerId: booking.logisticsPartnerId });
  return booking;
}

/**
 * Moves the pickup window of a job nobody has put a rider on yet (still offered, or accepted without a rider).
 * False when a rider already has it.
 */
export async function moveDeliveryJobWindow(bookingId: string, window: { start: Date; end: Date; pickupLocation?: string }) {
  const moved = await db.deliveryBooking.updateMany({
    where: { id: bookingId, riderId: null, status: { in: ["pending", "confirmed"] } },
    data: { pickupWindowStart: window.start, pickupWindowEnd: window.end, ...(window.pickupLocation ? { pickupLocation: window.pickupLocation } : {}) },
  });
  if (moved.count !== 1) return false;
  const booking = await db.deliveryBooking.findUnique({ where: { id: bookingId } });
  if (booking) void emitPartnerEvent(booking.logisticsPartnerId, "job.updated", partnerJob(booking)).catch(() => undefined);
  return true;
}

/** Cancels a job nobody has put a rider on yet. False when a rider already has it. */
export async function cancelUnassignedDeliveryJob(bookingId: string) {
  const booking = await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { id: true, logisticsPartnerId: true } });
  if (!booking) return true;
  const moved = await db.deliveryBooking.updateMany({ where: { id: bookingId, riderId: null, status: { in: ["pending", "confirmed"] } }, data: { status: "cancelled" } });
  if (moved.count !== 1) return false;
  void emitPartnerEvent(booking.logisticsPartnerId, "job.cancelled", { id: booking.id, status: "cancelled", actor: "shop" }).catch(() => undefined);
  return true;
}
