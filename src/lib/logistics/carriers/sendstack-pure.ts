// Sendstack (https://docs.sendstackhq.com) without the network. Pure, unit-tested (tests/carriers.test.mjs).
// The client is ./sendstack.ts.

import type { JobStatus } from "../job-rules.ts";
import type { CarrierJobInput } from "./types.ts";
import { lagosDate, ngPhone, nigerianState } from "./nigeria.ts";

export const SENDSTACK_SANDBOX_URL = "https://sandbox.sendstack.africa/api/v1";

type Point = { lat: number; lng: number };

/** Sendstack answers { status: true | false, message, data }. Some answers come without the wrapper. */
export function readSendstack(httpOk: boolean, json: unknown): { ok: true; data: unknown } | { ok: false; message: string } {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  if (httpOk && body.status !== false) return { ok: true, data: "data" in body ? body.data : body };
  return { ok: false, message: typeof body.message === "string" && body.message ? body.message : "the request wasn't accepted" };
}

/** Body for POST /deliveries/offers (prices from each delivery partner on Sendstack). */
export function sendstackOffersBody(job: CarrierJobInput, from: Point, to: Point, pickupAt: Date) {
  const cod = job.codAmount && job.codAmount > 0 ? job.codAmount : 0;
  return {
    orderType: "PROCESSING",
    pickup: { lat: from.lat, long: from.lng, address: job.pickup.address, state: nigerianState(job.pickup.address), country: "NG", pickupDate: lagosDate(pickupAt) },
    drop: {
      lat: to.lat,
      long: to.lng,
      address: job.dropoff.address,
      state: nigerianState(job.dropoff.address),
      country: "NG",
      ...(job.weightKg && job.weightKg > 0 ? { weight: job.weightKg } : {}),
      ...(cod ? { podAmount: cod } : {}),
    },
  };
}

export interface SendstackOffer {
  partnerId: string;
  name: string;
  price: number;
}

/** The cheapest offer (its partner id is passed back as assignedPartner when booking). */
export function cheapestSendstackOffer(data: unknown): SendstackOffer | null {
  const offers = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  let best: SendstackOffer | null = null;
  for (const offer of offers) {
    const price = Number(offer.price);
    const id = typeof offer.id === "string" ? offer.id : null;
    if (!id || !Number.isFinite(price) || price <= 0) continue;
    if (!best || price < best.price) best = { partnerId: id, name: String(offer.name ?? offer.offerName ?? "Sendstack"), price };
  }
  return best;
}

/** Body for POST /deliveries: one pickup, one drop, with the chosen partner. */
export function sendstackDeliveryBody(job: CarrierJobInput, from: Point, to: Point, pickupAt: Date, partnerId: string | null, externalId: string) {
  const cod = job.codAmount && job.codAmount > 0 ? job.codAmount : 0;
  return {
    orderType: "PROCESSING",
    bookingName: job.dropoff.name,
    bookingPhone: ngPhone(job.dropoff.phone, "local"),
    ...(job.dropoff.email ? { bookingEmail: job.dropoff.email } : {}),
    pickup: {
      address: job.pickup.address,
      pickupName: job.pickup.name,
      pickupNumber: ngPhone(job.pickup.phone, "local"),
      ...(job.pickup.email ? { pickupEmail: job.pickup.email } : {}),
      lat: from.lat,
      long: from.lng,
      state: nigerianState(job.pickup.address),
      country: "NG",
      pickupDate: lagosDate(pickupAt),
    },
    drops: [
      {
        address: job.dropoff.address,
        recipientName: job.dropoff.name,
        recipientNumber: ngPhone(job.dropoff.phone, "local"),
        ...(job.dropoff.email ? { recipientEmail: job.dropoff.email } : {}),
        lat: to.lat,
        long: to.lng,
        state: nigerianState(job.dropoff.address),
        country: "NG",
        ...(job.weightKg && job.weightKg > 0 ? { weight: job.weightKg } : {}),
        ...(job.parcelValue ? { value: job.parcelValue } : {}),
        ...(job.notes ? { note: job.notes.slice(0, 500) } : {}),
        ...(cod ? { podAmount: cod } : {}),
        ...(partnerId ? { assignedPartner: partnerId } : {}),
        externalOrderId: externalId,
      },
    ],
  };
}

/** The drop's ids from a create response: trackingId (our reference), the drop id (to cancel) and the batch. */
export function readSendstackCreated(data: unknown) {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const drop = ((Array.isArray(d.drops) ? d.drops : [])[0] ?? {}) as Record<string, unknown>;
  const trackingId = typeof drop.trackingId === "string" ? drop.trackingId : null;
  const dropId = typeof drop.id === "string" ? drop.id : null;
  const batchId = typeof drop.batchId === "string" ? drop.batchId : typeof d.batchId === "string" ? d.batchId : null;
  if (!trackingId || !dropId) return null;
  const link = [drop.trackingUrl, d.trackingUrl].find((l) => typeof l === "string" && l.startsWith("https://")) as string | undefined;
  const total = Number(d.totalAmount);
  return { trackingId, dropId, batchId, trackingUrl: link ?? null, total: Number.isFinite(total) && total > 0 ? total : null };
}

/** The drop's status from GET /deliveries/track. */
export function readSendstackStatus(data: unknown, trackingId: string) {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const drops = (Array.isArray(d.drops) ? d.drops : []) as Array<Record<string, unknown>>;
  const drop = drops.find((x) => x.trackingId === trackingId) ?? drops[0];
  const status = drop?.status ?? d.status;
  return typeof status === "string" ? status : null;
}

/** A Sendstack drop status as a Shopinbos job status. */
export function sendstackBookingStatus(status: string | null | undefined): JobStatus | null {
  switch ((status ?? "").toUpperCase()) {
    case "PENDING":
    case "ASSIGNED":
    case "ACCEPTED":
    case "REJECTED": // a partner turned it down; Sendstack finds another
    case "ARRIVED_FOR_PICKUP":
      return "confirmed";
    case "PICKED_UP":
      return "picked_up";
    case "IN_TRANSIT":
    case "ARRIVED_FOR_DELIVERY":
      return "in_transit";
    case "DELIVERED":
      return "delivered";
    case "UNABLE_TO_DELIVER":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return null;
  }
}

/** The tracking id a Sendstack webhook is about (order.status, order.new, order.message). */
export function sendstackWebhookRef(payload: unknown) {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (typeof body.trackingId === "string" && body.trackingId) return body.trackingId;
  const drop = ((Array.isArray(body.drops) ? body.drops : [])[0] ?? {}) as Record<string, unknown>;
  return typeof drop.trackingId === "string" && drop.trackingId ? drop.trackingId : null;
}
