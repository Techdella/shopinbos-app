// Shipbubble (https://docs.shipbubble.com) without the network: request bodies, reading rates and labels, status
// mapping. Pure, unit-tested (tests/shipbubble.test.mjs). The client is ./shipbubble.ts.
//
// Shipbubble is an aggregator: one rate request returns many couriers (GIG, DHL, Kwik, Redstar, Dellyman…), each
// shown to sellers as its own option ("Price set by GIG logistics").

import type { JobStatus } from "../job-rules.ts";
import type { CarrierJobInput, CarrierParty } from "./types.ts";
import { lagosDate, ngPhone } from "./nigeria.ts";

export const SHIPBUBBLE_URL = "https://api.shipbubble.com/v1";

/** Shipbubble answers { status: "success" | "failed", message, data, errors? }; its docs say not to rely on message. */
export function readShipbubble(httpOk: boolean, json: unknown): { ok: true; data: unknown } | { ok: false; message: string } {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  if (httpOk && body.status === "success") return { ok: true, data: body.data };
  const errors = Array.isArray(body.errors) ? body.errors.filter((e): e is string => typeof e === "string") : [];
  const message = errors[0] ?? (typeof body.message === "string" && body.message ? body.message : "the request wasn't accepted");
  return { ok: false, message: message.slice(0, 300) };
}

/** Body for POST /shipping/address/validate. Our coordinates, when we have them, place the address exactly. */
export function shipbubbleAddressBody(party: CarrierParty, fallbackEmail: string, at?: { lat: number; lng: number } | null) {
  return {
    name: party.name.slice(0, 120),
    email: party.email?.trim() || fallbackEmail,
    phone: ngPhone(party.phone, "intl"),
    address: party.address,
    ...(at ? { latitude: at.lat, longitude: at.lng } : {}),
  };
}

export function readAddressCode(data: unknown) {
  const code = (data as Record<string, unknown> | null)?.address_code;
  const n = Number(code);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The category to declare: the env's, else one named like the parcel's description, else a general one. */
export function pickCategory(categories: Array<{ category_id: number; category: string }>, hint?: string | null, envId?: number | null) {
  if (envId) return envId;
  const words = (hint ?? "").toLowerCase();
  const match = words ? categories.find((c) => words.includes(c.category.toLowerCase()) || c.category.toLowerCase().split(/\s+/).some((w) => w.length > 3 && words.includes(w))) : null;
  const general = categories.find((c) => /other|general|accessor|fashion/i.test(c.category));
  return (match ?? general ?? categories[0])?.category_id ?? null;
}

/** Body for POST /shipping/fetch_rates. Weight in KG, sizes in CM; the field is spelt "reciever" by Shipbubble. */
export function shipbubbleRatesBody(job: CarrierJobInput, codes: { sender: number; receiver: number }, categoryId: number, pickupAt: Date) {
  const weight = job.weightKg && job.weightKg > 0 ? job.weightKg : 1;
  return {
    sender_address_code: codes.sender,
    reciever_address_code: codes.receiver,
    pickup_date: lagosDate(pickupAt),
    category_id: categoryId,
    package_items: [
      {
        name: (job.notes?.split(" · ")[0] || "Parcel").slice(0, 100),
        description: (job.notes || "Parcel").slice(0, 200),
        unit_weight: String(weight),
        unit_amount: String(Math.max(100, Math.round(job.parcelValue ?? 1000))),
        quantity: "1",
      },
    ],
    package_dimension: { length: 20, width: 20, height: 10 },
    ...(job.notes ? { delivery_instructions: job.notes.slice(0, 300) } : {}),
  };
}

export interface ShipbubbleOption {
  /** "<service_code>:<courier_id>": what booking sends back. */
  id: string;
  serviceCode: string;
  courierId: string;
  name: string;
  /** What Shipbubble charges the wallet ("total"). */
  price: number;
  currency: string;
  eta: string | null;
  cod: boolean;
}

/** The couriers from a rates response, cheapest first, and the request token booking needs. */
export function readShipbubbleRates(data: unknown): { token: string | null; options: ShipbubbleOption[] } {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const couriers = (Array.isArray(d.couriers) ? d.couriers : []) as Array<Record<string, unknown>>;
  const options = couriers
    .map((c): ShipbubbleOption | null => {
      const serviceCode = typeof c.service_code === "string" ? c.service_code : null;
      const courierId = c.courier_id === undefined || c.courier_id === null ? null : String(c.courier_id);
      const price = Number(c.total ?? c.rate_card_amount);
      if (!serviceCode || !courierId || !Number.isFinite(price) || price <= 0) return null;
      const currency = typeof c.currency === "string" && /^[A-Z]{3}$/.test(c.currency) ? c.currency : typeof c.rate_card_currency === "string" ? c.rate_card_currency : "NGN";
      return {
        id: `${serviceCode}:${courierId}`,
        serviceCode,
        courierId,
        name: String(c.courier_name ?? serviceCode).trim().slice(0, 80),
        price: Math.round(price * 100) / 100,
        currency,
        eta: typeof c.delivery_eta === "string" ? c.delivery_eta.slice(0, 80) : null,
        cod: c.is_cod_available === true,
      };
    })
    .filter((o): o is ShipbubbleOption => o !== null)
    .sort((a, b) => a.price - b.price);
  return { token: typeof d.request_token === "string" ? d.request_token : null, options };
}

/** The label from POST /shipping/labels: order id (our reference), tracking link and what was charged. */
export function readShipbubbleLabel(data: unknown) {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const orderId = typeof d.order_id === "string" && d.order_id ? d.order_id : null;
  if (!orderId) return null;
  const fee = Number((d.payment as Record<string, unknown> | undefined)?.shipping_fee);
  const link = typeof d.tracking_url === "string" && d.tracking_url.startsWith("https://") ? d.tracking_url : null;
  return { orderId, trackingUrl: link, fee: Number.isFinite(fee) && fee > 0 ? fee : null };
}

/** A label's status from GET /shipping/labels/list/:order_ids. */
export function readShipbubbleStatus(data: unknown, orderId: string) {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const rows = (Array.isArray(d.results) ? d.results : Array.isArray(data) ? (data as unknown[]) : []) as Array<Record<string, unknown>>;
  const row = rows.find((r) => r.order_id === orderId) ?? rows[0];
  return typeof row?.status === "string" ? row.status : null;
}

/** A Shipbubble shipment status as a Shopinbos job status. */
export function shipbubbleBookingStatus(status: string | null | undefined): JobStatus | null {
  switch ((status ?? "").toLowerCase().replace(/\s+/g, "_")) {
    case "pending":
    case "confirmed":
      return "confirmed";
    case "picked_up":
      return "picked_up";
    case "in_transit":
      return "in_transit";
    case "completed":
    case "delivered":
      return "delivered";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
    case "returned":
      return "failed";
    default:
      return null;
  }
}

/** The order a Shipbubble webhook is about (shipment.* events carry the label, with order_id). */
export function shipbubbleWebhookRef(payload: unknown) {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return typeof body.order_id === "string" && body.order_id ? body.order_id : null;
}
