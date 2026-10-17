// Sendbox (https://docs.sendbox.co) without the network. Pure, unit-tested (tests/carriers.test.mjs). The client is
// ./sendbox.ts. Local (in-country) shipments only.

import type { JobStatus } from "../job-rules.ts";
import type { CarrierJobInput, CarrierParty } from "./types.ts";
import { lagosDate, ngPhone, nigerianState, splitName } from "./nigeria.ts";

export const SENDBOX_STAGING_URL = "https://sandbox.staging.sendbox.co";

type Point = { lat: number; lng: number };

function address(party: CarrierParty, at: Point) {
  const { first, last } = splitName(party.name);
  const state = nigerianState(party.address);
  return {
    first_name: first,
    last_name: last,
    name: party.name,
    street: party.address,
    state,
    // Sendbox wants a city; the state's name is the closest we always have.
    city: state === "FCT" ? "Abuja" : state,
    country: "NG",
    phone: ngPhone(party.phone, "intl"),
    email: party.email ?? null,
    lat: at.lat,
    lng: at.lng,
  };
}

/** Body for POST /shipping/shipment_delivery_quote and, with service_code and callback_url, /shipping/shipments. */
export function sendboxShipmentBody(job: CarrierJobInput, from: Point, to: Point, pickupAt: Date, extra: { serviceCode?: string; callbackUrl?: string | null } = {}) {
  const weight = job.weightKg && job.weightKg > 0 ? job.weightKg : 1;
  const value = Math.round(job.parcelValue ?? job.codAmount ?? 0);
  return {
    origin: address(job.pickup, from),
    destination: address(job.dropoff, to),
    weight,
    dimension: { length: 1, width: 1, height: 1 },
    incoming_option: "pickup",
    region: "NG",
    service_type: "local",
    package_type: "general",
    total_value: value,
    currency: "NGN",
    channel_code: "api",
    pickup_date: lagosDate(pickupAt),
    items: [{ name: "Parcel", description: job.notes?.slice(0, 200) || "Parcel", quantity: 1, weight, value }],
    service_code: extra.serviceCode ?? "standard",
    ...(extra.callbackUrl ? { callback_url: extra.callbackUrl } : {}),
  };
}

/** The rate to book: the one Sendbox selected, else the cheapest enabled one. Its code goes back as service_code. */
export function pickSendboxRate(json: unknown): { code: string; fee: number; currency: string } | null {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const rates = (Array.isArray(body.rates) ? body.rates : []) as Array<Record<string, unknown>>;
  const read = (r: Record<string, unknown> | undefined) => {
    const fee = Number(r?.fee);
    const code = r?.service_code ?? r?.code;
    return r && r.is_enabled !== false && Number.isFinite(fee) && fee > 0 && typeof code === "string"
      ? { code, fee, currency: typeof r.currency === "string" ? r.currency : String(body.currency ?? "NGN") }
      : null;
  };
  const selected = read(body.rate as Record<string, unknown> | undefined);
  if (selected) return selected;
  return rates.map(read).filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.fee - b.fee)[0] ?? null;
}

/** The shipment from a create response: tracking code (our reference), id, fee and whether it was paid. */
export function readSendboxShipment(json: unknown) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const code = body.tracking_code ?? body.code;
  const id = body.id ?? body._id ?? body.pk;
  if (typeof code !== "string" || !code) return null;
  const fee = Number(body.fee ?? body.amount);
  return {
    code,
    id: typeof id === "string" ? id : null,
    fee: Number.isFinite(fee) && fee > 0 ? fee : null,
    status: typeof body.status_code === "string" ? body.status_code : null,
  };
}

/** The shipment's status code from POST /shipping/tracking. */
export function readSendboxStatus(json: unknown) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const status = body.status_code ?? (body.status as Record<string, unknown> | undefined)?.code;
  return typeof status === "string" ? status : null;
}

/**
 * A Sendbox status code as a Shopinbos job status. "drafted" means unpaid (the Sendbox wallet is short): it stays
 * "confirmed" here and booking refuses it up front. Sendbox documents no cancelled or failed codes; anything that
 * says so is mapped too.
 */
export function sendboxBookingStatus(status: string | null | undefined): JobStatus | null {
  const s = (status ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("fail") || s.includes("return")) return "failed";
  if (s === "delivered") return "delivered";
  if (s === "in_delivery" || s === "in_transit") return "in_transit";
  if (s === "pickup_completed") return "picked_up";
  if (s === "drafted" || s === "pending" || s === "pickup_started" || s === "processing") return "confirmed";
  return null;
}

/** The tracking code a Sendbox callback is about (its payload isn't documented: the shipment or tracking object). */
export function sendboxWebhookRef(payload: unknown) {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const ref = body.tracking_code ?? body.code;
  return typeof ref === "string" && ref ? ref : null;
}
