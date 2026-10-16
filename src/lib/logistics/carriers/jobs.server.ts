import "server-only";
import type { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { stepsTo } from "../job-rules";
import { transitionJob } from "../jobs";
import { carrierFor } from "./index";
import type { Carrier, CarrierJobInput, CarrierResult } from "./types";

// Jobs with delivery companies we book through their own API (LogisticsPartner.carrier). They skip the partner
// portal: the price comes live from the carrier, the job is created with the carrier when booked (so it starts
// "confirmed"), and syncCarrierJobs (GET /api/cron/carrier-sync) moves it from the carrier's own status, through
// transitionJob, so the seller's order and notifications follow like any other job.

/** A carrier failure as an API error: a bad address is the caller's to fix, a carrier that's down is a 503. */
export function carrierError(res: { code: string; error: string }) {
  if (res.code === "BAD_ADDRESS") return apiError("BAD_REQUEST", res.error, 400);
  if (res.code === "UNAVAILABLE" || res.code === "NOT_CONFIGURED") return apiError("CARRIER_UNAVAILABLE", res.error, 503);
  if (res.code === "PRICE_CHANGED") return apiError("PRICE_CHANGED", res.error, 409);
  return apiError("CARRIER_REJECTED", res.error, 422);
}

/** How long a live carrier price is good for when it answers a quote request. */
export const CARRIER_QUOTE_TTL_MS = 30 * 60 * 1000;

const OPEN_STATUSES = ["pending", "confirmed", "picked_up", "in_transit"] as const;

type Contact = { name: string; phone: string; email?: string | null };

/** The shop's side: the store's name and the seller's phone (or the one given). */
async function shopContact(sellerId: string, phone?: string | null): Promise<Contact> {
  const user = await db.user.findUnique({ where: { id: sellerId }, select: { name: true, email: true, phone: true, store: { select: { name: true } } } });
  return { name: user?.store?.name || user?.name || "Shop", phone: phone?.trim() || user?.phone || "", email: user?.email ?? null };
}

/** The buyer on one of the seller's own orders. */
async function orderBuyer(sellerId: string, orderId?: string | null): Promise<{ contact: Contact | null; total: number | null }> {
  if (!orderId) return { contact: null, total: null };
  const order = await db.retailOrder.findFirst({ where: { id: orderId, store: { userId: sellerId } }, select: { buyerName: true, buyerPhone: true, buyerEmail: true, total: true } });
  return {
    contact: order?.buyerPhone ? { name: order.buyerName || "Customer", phone: order.buyerPhone, email: order.buyerEmail || null } : null,
    total: order ? Number(order.total) : null,
  };
}

/**
 * Who the rider meets at either end. The buyer is the one given, else the order's buyer, else the shop itself
 * (a quote with no order: the rider calls the shop for the customer's details).
 */
export async function carrierJobInput(input: {
  sellerId: string;
  pickupLocation: string;
  destination: string;
  orderId?: string | null;
  recipient?: Contact | null;
  pickupPhone?: string | null;
  weightKg?: number | null;
  codAmount?: number | null;
  notes?: string | null;
  pickupAt?: Date | null;
}): Promise<CarrierJobInput> {
  const shop = await shopContact(input.sellerId, input.pickupPhone);
  const order = await orderBuyer(input.sellerId, input.orderId);
  const buyer = input.recipient ?? order.contact ?? shop;
  return {
    pickup: { ...shop, address: input.pickupLocation },
    dropoff: { ...buyer, address: input.destination },
    weightKg: input.weightKg ?? null,
    codAmount: input.codAmount ?? null,
    parcelValue: order.total,
    notes: input.notes ?? null,
    pickupAt: input.pickupAt ?? null,
  };
}

/**
 * Books the job with the carrier, then saves it, "confirmed", at the carrier's price. If saving fails the carrier
 * job is cancelled again so nobody is sent for a job we don't know about.
 */
export async function createCarrierBooking(input: {
  carrier: Carrier;
  job: CarrierJobInput;
  /** Refuse when the live price went above what the seller agreed to. */
  maxPrice?: number | null;
  data: Omit<Prisma.DeliveryBookingUncheckedCreateInput, "deliveryFee" | "currency" | "status">;
}): Promise<CarrierResult<Prisma.DeliveryBookingGetPayload<object>>> {
  const booked = await input.carrier.book(input.job, { maxPrice: input.maxPrice });
  if (!booked.ok) return booked;
  const { value } = booked;
  try {
    const booking = await db.deliveryBooking.create({
      data: {
        ...input.data,
        deliveryFee: value.price,
        currency: value.currency,
        status: "confirmed",
        codAmount: input.job.codAmount && input.job.codAmount > 0 ? input.job.codAmount : null,
        externalCarrier: input.carrier.id,
        externalRef: value.ref,
        externalJobIds: value.jobIds,
        externalTrackingUrl: value.trackingUrl,
        externalStatus: "created",
        externalSyncedAt: new Date(),
      },
    });
    return { ok: true, value: booking };
  } catch (error) {
    await input.carrier.cancel({ ref: value.ref, jobIds: value.jobIds }).catch(() => null);
    throw error;
  }
}

const jobIdsOf = (value: Prisma.JsonValue | null) => (Array.isArray(value) ? value.filter((id): id is string | number => typeof id === "string" || typeof id === "number") : []);

/** The seller cancels a carrier job before pickup: cancelled with the carrier first, then here. */
export async function cancelCarrierBooking(bookingId: string, sellerId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const job = await db.deliveryBooking.findFirst({
    where: { id: bookingId, sellerId },
    select: { id: true, status: true, externalRef: true, externalJobIds: true, logisticsPartner: { select: { carrier: true } } },
  });
  if (!job) return { ok: false, status: 404, error: "Booking not found" };
  const carrier = carrierFor(job.logisticsPartner);
  if (!carrier || !job.externalRef) return { ok: false, status: 400, error: "This booking isn't with a delivery company we book directly." };
  if (job.status !== "pending" && job.status !== "confirmed") return { ok: false, status: 409, error: "The rider already has it, so it can't be cancelled here. Call the delivery company." };
  const res = await carrier.cancel({ ref: job.externalRef, jobIds: jobIdsOf(job.externalJobIds) });
  if (!res.ok) return { ok: false, status: res.code === "UNAVAILABLE" ? 503 : 409, error: res.error };
  await db.deliveryBooking.updateMany({ where: { id: job.id, status: { in: ["pending", "confirmed"] } }, data: { status: "cancelled", externalStatus: "cancelled_by_shop", externalSyncedAt: new Date() } });
  return { ok: true };
}

export interface CarrierSyncResult {
  checked: number;
  moved: number;
  failed: number;
}

/**
 * Reads the carrier's status of open carrier jobs (least recently checked first) and moves each job there, one
 * step at a time, so the seller's order follows. A job the carrier can't move to (e.g. cancelled after pickup)
 * keeps its status here, with the carrier's raw status saved for the team.
 */
export async function syncCarrierJobs(options: { limit?: number; ids?: string[] } = {}): Promise<CarrierSyncResult> {
  const jobs = await db.deliveryBooking.findMany({
    where: { externalCarrier: { not: null }, externalRef: { not: null }, status: { in: [...OPEN_STATUSES] }, ...(options.ids ? { id: { in: options.ids } } : {}) },
    orderBy: [{ externalSyncedAt: { sort: "asc", nulls: "first" } }],
    take: options.limit ?? 40,
    select: { id: true, status: true, codAmount: true, externalCarrier: true, externalRef: true, externalJobIds: true, logisticsPartnerId: true },
  });
  const result: CarrierSyncResult = { checked: 0, moved: 0, failed: 0 };
  for (const job of jobs) {
    const carrier = carrierFor({ carrier: job.externalCarrier });
    if (!carrier || !job.externalRef) continue;
    result.checked += 1;
    const tracked = await carrier.track({ ref: job.externalRef, jobIds: jobIdsOf(job.externalJobIds) }).catch(() => null);
    if (!tracked?.ok) {
      result.failed += 1;
      await db.deliveryBooking.update({ where: { id: job.id }, data: { externalSyncedAt: new Date() } }).catch(() => null);
      continue;
    }
    const { status: target, raw } = tracked.value;
    let moved = false;
    for (const step of target ? stepsTo(job.status, target) : []) {
      const res = await transitionJob({
        bookingId: job.id,
        partnerId: job.logisticsPartnerId,
        to: step,
        actor: "carrier",
        failedReason: step === "failed" ? `${carrier.name} couldn't deliver it.` : null,
        // Pay on delivery: the carrier collects and settles the cash with the Shopinbos account, not as a
        // partner cash pay-in, so it's recorded as a transfer.
        ...(step === "delivered" && job.codAmount ? { codCollected: job.codAmount, codMethod: "transfer" } : {}),
      });
      if (!res.ok) break;
      moved = true;
    }
    if (moved) result.moved += 1;
    await db.deliveryBooking.update({ where: { id: job.id }, data: { externalStatus: raw.slice(0, 120) || null, externalSyncedAt: new Date() } }).catch(() => null);
  }
  return result;
}
