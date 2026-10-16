// Fez Delivery (https://fez-delivery-co.gitbook.io/fezcorporate-api-docs) without the network. Pure, unit-tested
// (tests/carriers.test.mjs). The client is ./fez.ts.

import type { JobStatus } from "../job-rules.ts";
import type { CarrierJobInput } from "./types.ts";
import { lagosDate, ngPhone, nigerianState } from "./nigeria.ts";

export const FEZ_SANDBOX_URL = "https://apisandbox.fezdelivery.co/v1";

/** Fez answers { status: "Success" | "Error", description, ... }. */
export function fezOk(httpOk: boolean, json: unknown) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  return httpOk && String(body.status).toLowerCase() === "success";
}

/** Fez's login answer: the bearer token, its expiry (Lagos time) and the organisation's secret key. */
export function readFezLogin(json: unknown, now = Date.now()) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const auth = (body.authDetails ?? {}) as Record<string, unknown>;
  const org = (body.orgDetails ?? {}) as Record<string, unknown>;
  const token = typeof auth.authToken === "string" ? auth.authToken : "";
  const secret = typeof org["secret-key"] === "string" ? (org["secret-key"] as string) : "";
  if (!token || !secret) return null;
  // "2023-01-27 05:06:08", Lagos time. Refresh 10 minutes early; without a readable expiry, after 6 hours.
  const expires = typeof auth.expireToken === "string" ? Date.parse(`${auth.expireToken.replace(" ", "T")}+01:00`) : NaN;
  const until = Number.isFinite(expires) ? expires - 10 * 60_000 : now + 6 * 60 * 60_000;
  return { token, secret, until };
}

/** Body for POST /order/cost. Weight defaults to Fez's 0-5kg band. */
export function fezCostBody(job: CarrierJobInput) {
  return {
    state: nigerianState(job.dropoff.address),
    pickUpState: nigerianState(job.pickup.address),
    ...(job.weightKg && job.weightKg > 0 ? { weight: job.weightKg } : {}),
  };
}

/** What Fez charges: totalCost (cost plus VAT), else the lowercase cost (Fez: not "Cost"). */
export function readFezCost(json: unknown) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const total = Number(body.totalCost);
  if (Number.isFinite(total) && total > 0) return total;
  const cost = Number((body.cost as Record<string, unknown> | undefined)?.cost);
  return Number.isFinite(cost) && cost > 0 ? cost : null;
}

/** Body for POST /order: an array of one order. The shop is the sender ("thirdparty"), not Shopinbos. */
export function fezOrderBody(job: CarrierJobInput, uniqueId: string, pickupAt: Date) {
  const cod = job.codAmount && job.codAmount > 0 ? job.codAmount : 0;
  return [
    {
      recipientAddress: job.dropoff.address,
      recipientState: nigerianState(job.dropoff.address),
      recipientName: job.dropoff.name,
      recipientPhone: ngPhone(job.dropoff.phone, "local"),
      ...(job.dropoff.email ? { recipientEmail: job.dropoff.email } : {}),
      uniqueID: uniqueId,
      BatchID: uniqueId,
      valueOfItem: String(Math.round(job.parcelValue ?? cod ?? 0)),
      weight: Math.max(1, Math.ceil(job.weightKg ?? 1)),
      ...(job.notes ? { additionalDetails: job.notes.slice(0, 500) } : {}),
      pickUpState: nigerianState(job.pickup.address),
      pickUpAddress: job.pickup.address,
      pickUpDate: lagosDate(pickupAt),
      isItemCod: cod > 0,
      ...(cod > 0 ? { cashOnDeliveryAmount: cod } : {}),
      thirdparty: "true",
      senderName: job.pickup.name,
      senderAddress: job.pickup.address,
      senderPhone: ngPhone(job.pickup.phone, "local"),
    },
  ];
}

/** The Fez order number for our uniqueID from a create response ({ orderNos: { [uniqueID]: orderNo } }). */
export function readFezOrderNo(json: unknown, uniqueId: string) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const orderNos = (body.orderNos ?? {}) as Record<string, unknown>;
  const no = orderNos[uniqueId] ?? Object.values(orderNos)[0];
  return typeof no === "string" && no ? no : null;
}

/** The order's status from GET /order/track/{orderNo}. */
export function readFezTrack(json: unknown) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const order = (body.order ?? {}) as Record<string, unknown>;
  const history = Array.isArray(body.history) ? (body.history as Array<Record<string, unknown>>) : [];
  const status = order.orderStatus ?? history[0]?.orderStatus;
  return typeof status === "string" ? status : null;
}

/**
 * A Fez order status as a Shopinbos job status. Fez publishes no full list; these are the ones its docs use.
 * Waiting for pickup or payment → confirmed (Fez has the job), Picked-Up → picked up, Dispatched → on the way,
 * Delivered, and Returned / Rejected / Failed Pick-Up → failed. Anything with "cancel" → cancelled.
 */
export function fezBookingStatus(status: string | null | undefined): JobStatus | null {
  const s = (status ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s.includes("cancel")) return "cancelled";
  if (s === "delivered") return "delivered";
  if (s === "dispatched" || s.includes("transit") || s.includes("outfordelivery")) return "in_transit";
  if (s === "pickedup") return "picked_up";
  if (s === "returned" || s.includes("rejected") || s.includes("failed")) return "failed";
  if (s.startsWith("pending") || s === "droppedoff" || s.includes("assigned")) return "confirmed";
  return null;
}

/** The order number a Fez webhook is about ({ orderNumber, status | orderStatus }). */
export function fezWebhookRef(payload: unknown) {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const ref = body.orderNumber ?? body.orderNo;
  return typeof ref === "string" && ref ? ref : null;
}
