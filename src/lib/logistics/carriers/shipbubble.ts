import "server-only";
import { callJson, carrierDown, carrierSaid, needPhones, notSetUp, pickupMoment, placeStops, priceCheck } from "./http.server";
import {
  SHIPBUBBLE_URL,
  pickCategory,
  readAddressCode,
  readShipbubble,
  readShipbubbleLabel,
  readShipbubbleRates,
  readShipbubbleStatus,
  shipbubbleAddressBody,
  shipbubbleBookingStatus,
  shipbubbleRatesBody,
  shipbubbleWebhookRef,
  type ShipbubbleOption,
} from "./shipbubble-pure";
import type { Carrier, CarrierCredentials, CarrierJobInput, CarrierResult } from "./types";

// Shipbubble (https://docs.shipbubble.com): one API for many couriers (GIG, DHL, Kwik, Redstar, Dellyman…). Each
// courier it prices is offered to sellers as its own option. One API key, `Authorization: Bearer <key>`
// (sb_sandbox_… for testing, sb_prod_… live), same base URL for both:
//   1. Addresses: POST /shipping/address/validate (name, email, phone, address, our coordinates) → address_code.
//   2. Prices: POST /shipping/fetch_rates → request_token and couriers[] (total = what the wallet is charged).
//   3. Book: POST /shipping/labels { request_token, service_code, courier_id } → order_id, tracking_url. Paid from
//      the Shopinbos Shipbubble wallet.
//   4. Status: GET /shipping/labels/list/:order_id. 5. Cancel: POST /shipping/labels/cancel/:order_id (only a
//      shipment scheduled for a later date).
// Webhooks (shipment.status.changed etc., URL set in the dashboard) only make us re-read the status.
//
// Pay on delivery isn't offered through Shipbubble yet: its docs don't say how the amount to collect is passed.
//
// Env: SHIPBUBBLE_API_KEY (required), SHIPBUBBLE_BASE_URL (optional), SHIPBUBBLE_CATEGORY_ID (optional: always
// declare this package category instead of picking one).

const NAME = "Shipbubble";

function config(creds?: CarrierCredentials | null) {
  return {
    apiKey: creds ? creds.apiKey?.trim() : process.env.SHIPBUBBLE_API_KEY?.trim(),
    baseUrl: (process.env.SHIPBUBBLE_BASE_URL?.trim() || SHIPBUBBLE_URL).replace(/\/+$/, ""),
    categoryId: Number(process.env.SHIPBUBBLE_CATEGORY_ID) || null,
    fallbackEmail: process.env.SHIPBUBBLE_CONTACT_EMAIL?.trim() || "deliveries@shopinbos.com",
  };
}

async function call(creds: CarrierCredentials | null | undefined, path: string, body?: unknown): Promise<CarrierResult<unknown>> {
  const { apiKey, baseUrl } = config(creds);
  if (!apiKey) return creds ? carrierSaid(NAME, "add your API key") : notSetUp(NAME, "SHIPBUBBLE_API_KEY");
  const res = await callJson(`${baseUrl}${path}`, { body, headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 30_000 });
  if ("error" in res) return carrierDown(NAME);
  if (res.status === 503 || res.status >= 500) return carrierDown(NAME);
  const read = readShipbubble(res.ok, res.json);
  if (read.ok) return { ok: true, value: read.data };
  if (/wallet/i.test(read.message)) return carrierSaid(NAME, `the ${creds ? "" : "Shopinbos "}Shipbubble wallet needs topping up before this delivery can be booked.`);
  return carrierSaid(NAME, read.message);
}

// Package categories rarely change: read once per server, per account.
const categoryCache = new Map<string, Array<{ category_id: number; category: string }>>();

async function categoryFor(creds: CarrierCredentials | null | undefined, hint?: string | null): Promise<CarrierResult<number>> {
  const { categoryId, apiKey } = config(creds);
  if (categoryId) return { ok: true, value: categoryId };
  let list = categoryCache.get(apiKey ?? "");
  if (!list) {
    const res = await call(creds, "/shipping/labels/categories");
    if (!res.ok) return res;
    list = (Array.isArray(res.value) ? res.value : [])
      .map((c) => c as Record<string, unknown>)
      .map((c) => ({ category_id: Number(c.category_id), category: String(c.category ?? "") }))
      .filter((c) => Number.isFinite(c.category_id) && c.category_id > 0);
    if (list.length) categoryCache.set(apiKey ?? "", list);
  }
  const id = pickCategory(list, hint);
  return id ? { ok: true, value: id } : carrierSaid(NAME, "no package category to declare");
}

type Rated = { token: string; options: ShipbubbleOption[] };

/** Validates both addresses and fetches every courier's price for the job. */
async function rate(job: CarrierJobInput, creds?: CarrierCredentials | null): Promise<CarrierResult<Rated>> {
  if (job.codAmount && job.codAmount > 0) return carrierSaid(NAME, "pay-on-delivery jobs can't be booked through Shipbubble yet. Pick another network.");
  const phones = needPhones(job);
  if (!phones.ok) return phones;
  const placed = await placeStops(job);
  if (!placed.ok) return placed;
  const { fallbackEmail } = config(creds);
  const [sender, receiver] = await Promise.all([
    call(creds, "/shipping/address/validate", shipbubbleAddressBody(job.pickup, fallbackEmail, placed.value.from)),
    call(creds, "/shipping/address/validate", shipbubbleAddressBody(job.dropoff, job.pickup.email?.trim() || fallbackEmail, placed.value.to)),
  ]);
  if (!sender.ok) return { ok: false, code: sender.code === "REJECTED" ? "BAD_ADDRESS" : sender.code, error: `Pickup address: ${sender.error}` };
  if (!receiver.ok) return { ok: false, code: receiver.code === "REJECTED" ? "BAD_ADDRESS" : receiver.code, error: `Delivery address: ${receiver.error}` };
  const senderCode = readAddressCode(sender.value);
  const receiverCode = readAddressCode(receiver.value);
  if (!senderCode || !receiverCode) return carrierSaid(NAME, "couldn't confirm the addresses");
  const category = await categoryFor(creds, job.notes);
  if (!category.ok) return category;
  const res = await call(creds, "/shipping/fetch_rates", shipbubbleRatesBody(job, { sender: senderCode, receiver: receiverCode }, category.value, pickupMoment(job)));
  if (!res.ok) return res;
  const rated = readShipbubbleRates(res.value);
  if (!rated.token || !rated.options.length) return carrierSaid(NAME, "no courier can take this route right now");
  return { ok: true, value: { token: rated.token, options: rated.options } };
}

export const shipbubble: Carrier = {
  id: "shipbubble",
  name: NAME,

  credentialFields: [{ key: "apiKey", label: "Shipbubble API key", secret: true }],

  configured() {
    return Boolean(config().apiKey);
  },

  async verify(creds) {
    const res = await call(creds, "/shipping/wallet/balance");
    return res.ok ? { ok: true, value: { label: `Key ${String(creds.apiKey ?? "").slice(0, 12)}…` } } : res;
  },

  async options(job, creds) {
    const res = await rate(job, creds);
    if (!res.ok) return res;
    return { ok: true, value: res.value.options.map((o) => ({ id: o.id, name: o.name, price: o.price, currency: o.currency, eta: o.eta })) };
  },

  async quote(job, creds) {
    const res = await rate(job, creds);
    if (!res.ok) return res;
    const cheapest = res.value.options[0];
    return { ok: true, value: { price: cheapest.price, currency: cheapest.currency } };
  },

  async book(job, options) {
    const res = await rate(job, options?.credentials);
    if (!res.ok) return res;
    // The courier the seller picked (or, without a pick, the cheapest).
    const chosen = options?.optionId ? res.value.options.find((o) => o.id === options.optionId) : res.value.options[0];
    if (!chosen) return carrierSaid(NAME, "that courier can't take this delivery any more. Compare prices again.");
    const tooDear = priceCheck<never>(chosen.name, chosen.price, chosen.currency, options?.maxPrice);
    if (tooDear) return tooDear;
    const created = await call(options?.credentials, "/shipping/labels", { request_token: res.value.token, service_code: chosen.serviceCode, courier_id: chosen.courierId });
    if (!created.ok) return created;
    const label = readShipbubbleLabel(created.value);
    if (!label) return carrierSaid(NAME, "the shipment was taken but no order number came back. Contact support before booking it again.");
    return {
      ok: true,
      value: { ref: label.orderId, jobIds: [chosen.id], trackingUrl: label.trackingUrl, price: label.fee ?? chosen.price, currency: chosen.currency },
    };
  },

  async cancel(booking, creds) {
    const res = await call(creds, `/shipping/labels/cancel/${encodeURIComponent(booking.ref)}`, {});
    if (res.ok) return { ok: true, value: null };
    return res.code === "REJECTED" ? carrierSaid(NAME, "the courier already has this shipment, so it can't be cancelled here. Contact support.") : res;
  },

  async track(booking, creds) {
    const { apiKey, baseUrl } = config(creds);
    if (!apiKey) return creds ? carrierSaid(NAME, "add your API key") : notSetUp(NAME, "SHIPBUBBLE_API_KEY");
    const res = await callJson(`${baseUrl}/shipping/labels/list/${encodeURIComponent(booking.ref)}`, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } });
    if ("error" in res) return carrierDown(NAME);
    const read = readShipbubble(res.ok, res.json);
    if (!read.ok) return carrierSaid(NAME, read.message);
    const raw = readShipbubbleStatus(read.data, booking.ref);
    return { ok: true, value: { status: shipbubbleBookingStatus(raw), raw: raw ?? "" } };
  },

  webhookRef: shipbubbleWebhookRef,
};
