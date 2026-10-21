import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { partnerJob } from "./partner-api-core";
import { emitPartnerEvent } from "./webhooks";
import { notifyJobOffered } from "@/lib/notifications/events.server";

// Creating a delivery job for a partner, the same way POST /api/app/logistics/bookings does (save it, then offer
// it to the partner's systems as "job.offered"). Used for supplier pickups (src/lib/supplier-orders/pickup.server.ts),
// which also carry a pickup window.

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
  /** Logistics marketplace jobs (src/lib/delivery-market/jobs.server.ts). */
  marketplace?: {
    service: string;
    sizeBand: string;
    pickupPointId: string | null;
    connectionId: string | null;
    rateCardId: string | null;
    shipmentKey: string;
    acceptBy: Date;
    estimatedDelivery: Date | null;
    /** The fee was paid to the partner in the customer's payment. */
    feePaidAt: Date | null;
  };
}

export async function createDeliveryJob(input: DeliveryJobInput, client: Prisma.TransactionClient = db) {
  const booking = await saveDeliveryJob(input, client);
  await announceDeliveryJob(booking);
  return booking;
}

/** Saves the job only (inside a transaction, say); call announceDeliveryJob once it's committed. */
export function saveDeliveryJob(input: DeliveryJobInput, client: Prisma.TransactionClient = db) {
  const market = input.marketplace;
  return client.deliveryBooking.create({
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
      ...(market
        ? {
            service: market.service,
            sizeBand: market.sizeBand,
            pickupPointId: market.pickupPointId,
            connectionId: market.connectionId,
            rateCardId: market.rateCardId,
            shipmentKey: market.shipmentKey,
            acceptBy: market.acceptBy,
            estimatedDelivery: market.estimatedDelivery,
            feePaidAt: market.feePaidAt,
          }
        : {}),
    },
  });
}

/** Offers a saved job to the partner's systems and tells the partner. */
export async function announceDeliveryJob(booking: { id: string; logisticsPartnerId: string } & Parameters<typeof partnerJob>[0]) {
  void emitPartnerEvent(booking.logisticsPartnerId, "job.offered", partnerJob(booking)).catch(() => undefined);
  await notifyJobOffered({ bookingId: booking.id, logisticsPartnerId: booking.logisticsPartnerId });
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
