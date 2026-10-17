import "server-only";
import { randomUUID } from "node:crypto";
import { callJson, carrierDown, carrierSaid, needPhones, notSetUp, pickupMoment, placeStops, priceCheck } from "./http.server";
import {
  SENDSTACK_SANDBOX_URL,
  cheapestSendstackOffer,
  readSendstack,
  readSendstackCreated,
  readSendstackStatus,
  sendstackBookingStatus,
  sendstackDeliveryBody,
  sendstackOffersBody,
  sendstackWebhookRef,
} from "./sendstack-pure";
import type { Carrier, CarrierCredentials, CarrierJobInput, CarrierResult } from "./types";

// Sendstack (https://docs.sendstackhq.com): same-day and scheduled bike delivery, mostly Lagos, through partner
// riders on its network. Every call sends the app's `app_id` and `app_secret` headers:
//   1. Price: POST /deliveries/offers → one offer per partner; we take the cheapest and book that partner.
//   2. Book: POST /deliveries → drops[0] { id, trackingId, trackingUrl, batchId }. Paid from the Sendstack wallet
//      (a 422 means it's short).
//   3. Status: GET /deliveries/track?trackingId=&batchId=. 4. Cancel: POST /drops/cancel { dropIds }.
// Webhooks (order.status etc., set in the dashboard) only make us re-read the status.
//
// Env: SENDSTACK_APP_ID and SENDSTACK_APP_SECRET (required), SENDSTACK_BASE_URL (default: the sandbox,
// https://sandbox.sendstack.africa/api/v1; live is https://api.sendstack.africa/api/v1 with live keys).

const NAME = "Sendstack";

/** The account to use: a seller's own (creds), else Shopinbos's from the environment. */
function config(creds?: CarrierCredentials | null) {
  return {
    appId: creds ? creds.appId?.trim() : process.env.SENDSTACK_APP_ID?.trim(),
    appSecret: creds ? creds.appSecret?.trim() : process.env.SENDSTACK_APP_SECRET?.trim(),
    baseUrl: (process.env.SENDSTACK_BASE_URL?.trim() || SENDSTACK_SANDBOX_URL).replace(/\/+$/, ""),
  };
}

async function call(creds: CarrierCredentials | null | undefined, path: string, init: { method?: string; body?: unknown } = {}): Promise<CarrierResult<unknown>> {
  const { appId, appSecret, baseUrl } = config(creds);
  if (!appId || !appSecret) return creds ? carrierSaid(NAME, "add your app ID and app secret") : notSetUp(NAME, "SENDSTACK_APP_ID and SENDSTACK_APP_SECRET");
  const res = await callJson(`${baseUrl}${path}`, { ...init, headers: { app_id: appId, app_secret: appSecret, "x-sendstack-source": "control.sendstack" } });
  if ("error" in res) return carrierDown(NAME);
  if (res.status === 422) return carrierSaid(NAME, `the ${creds ? "" : "Shopinbos "}Sendstack wallet needs topping up before this delivery can be booked.`);
  const read = readSendstack(res.ok, res.json);
  return read.ok ? { ok: true, value: read.data } : carrierSaid(NAME, read.message);
}

async function offer(job: CarrierJobInput, creds?: CarrierCredentials | null) {
  const phones = needPhones(job);
  if (!phones.ok) return phones;
  const placed = await placeStops(job);
  if (!placed.ok) return placed;
  const { from, to } = placed.value;
  const pickupAt = pickupMoment(job);
  const res = await call(creds, "/deliveries/offers", { body: sendstackOffersBody(job, from, to, pickupAt) });
  if (!res.ok) return res;
  const best = cheapestSendstackOffer(res.value);
  if (!best) return carrierSaid<never>(NAME, "no rider can take this route right now");
  return { ok: true as const, value: { best, from, to, pickupAt } };
}

export const sendstack: Carrier = {
  id: "sendstack",
  name: NAME,

  credentialFields: [
    { key: "appId", label: "Sendstack app ID" },
    { key: "appSecret", label: "Sendstack app secret", secret: true },
  ],

  configured() {
    const { appId, appSecret } = config();
    return Boolean(appId && appSecret);
  },

  async verify(creds) {
    const res = await call(creds, "/locations?country=NG", { method: "GET" });
    return res.ok ? { ok: true, value: { label: `App ${String(creds.appId ?? "").slice(0, 4)}…` } } : res;
  },

  async quote(job, creds) {
    const res = await offer(job, creds);
    return res.ok ? { ok: true, value: { price: res.value.best.price, currency: "NGN" } } : res;
  },

  async book(job, options) {
    const priced = await offer(job, options?.credentials);
    if (!priced.ok) return priced;
    const { best, from, to, pickupAt } = priced.value;
    const tooDear = priceCheck<never>(NAME, best.price, "NGN", options?.maxPrice);
    if (tooDear) return tooDear;
    const externalId = `SIB-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
    const res = await call(options?.credentials, "/deliveries", { body: sendstackDeliveryBody(job, from, to, pickupAt, best.partnerId, externalId) });
    if (!res.ok) return res;
    const created = readSendstackCreated(res.value);
    if (!created) return carrierSaid(NAME, "the delivery was taken but no tracking id came back. Contact support before booking it again.");
    return {
      ok: true,
      value: {
        ref: created.trackingId,
        jobIds: [created.dropId, ...(created.batchId ? [created.batchId] : [])],
        trackingUrl: created.trackingUrl,
        price: created.total ?? best.price,
        currency: "NGN",
      },
    };
  },

  async cancel(booking, creds) {
    const [dropId, batchId] = booking.jobIds.map(String);
    if (!dropId) return carrierSaid(NAME, "this delivery has no drop id to cancel");
    const res = await call(creds, "/drops/cancel", { body: { dropIds: [dropId], trackingId: booking.ref, ...(batchId ? { batchId } : {}), note: "Cancelled by the shop" } });
    return res.ok ? { ok: true, value: null } : res;
  },

  async track(booking, creds) {
    const batchId = booking.jobIds.map(String)[1];
    const query = new URLSearchParams({ trackingId: booking.ref, ...(batchId ? { batchId } : {}) });
    const res = await call(creds, `/deliveries/track?${query}`, { method: "GET" });
    if (!res.ok) return res;
    const raw = readSendstackStatus(res.value, booking.ref);
    return { ok: true, value: { status: sendstackBookingStatus(raw), raw: raw ?? "" } };
  },

  webhookRef: sendstackWebhookRef,
};
