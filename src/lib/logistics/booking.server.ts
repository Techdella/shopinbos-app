import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { partnerJob } from "./partner-api-core";
import { emitPartnerEvent } from "./webhooks";
import { notifyJobOffered } from "@/lib/notifications/events.server";
import type { LatLng } from "@shared/delivery-geo";
import { findNgPostcode } from "@shared/ng-postcode";
import { bookingGeoFields } from "./booking-geo.server";

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
  /** The supplier's saved pin and postcode, when the job picks up from their saved address. */
  pickupPoint?: LatLng | null;
  pickupPostcode?: string | null;
}

export async function createDeliveryJob(input: DeliveryJobInput) {
  const geo = await bookingGeoFields({
    pickup: { address: input.pickupLocation, point: input.pickupPoint, postcode: input.pickupPostcode },
    dropoff: { address: input.destination },
    orderId: input.orderId,
  });
  const booking = await db.deliveryBooking.create({
    data: {
      ...geo,
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
export async function moveDeliveryJobWindow(bookingId: string, window: { start: Date; end: Date; pickupLocation?: string; pickupPoint?: LatLng | null; pickupPostcode?: string | null }) {
  const current = window.pickupLocation ? await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { pickupLocation: true } }) : null;
  // A new pickup address takes its own pin (or none yet: geocoded again when partners open the job).
  const moving = Boolean(window.pickupLocation && current && current.pickupLocation !== window.pickupLocation);
  const pickupGeo = moving
    ? window.pickupPoint
      ? { pickupLat: window.pickupPoint.lat, pickupLng: window.pickupPoint.lng, pickupGeoSource: "pin", pickupGeocodedAt: new Date() }
      : { pickupLat: null, pickupLng: null, pickupGeoSource: null, pickupGeocodedAt: null }
    : {};
  const moved = await db.deliveryBooking.updateMany({
    where: { id: bookingId, riderId: null, status: { in: ["pending", "confirmed"] } },
    data: {
      pickupWindowStart: window.start,
      pickupWindowEnd: window.end,
      ...(window.pickupLocation ? { pickupLocation: window.pickupLocation, pickupPostcode: window.pickupPostcode ?? findNgPostcode(window.pickupLocation)?.canonical ?? null } : {}),
      ...pickupGeo,
    },
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
