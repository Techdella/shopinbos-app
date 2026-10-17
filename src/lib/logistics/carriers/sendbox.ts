import "server-only";
import { callJson, carrierDown, carrierSaid, errorMessage, needPhones, notSetUp, pickupMoment, placeStops, priceCheck } from "./http.server";
import { SENDBOX_STAGING_URL, pickSendboxRate, readSendboxShipment, readSendboxStatus, sendboxBookingStatus, sendboxShipmentBody, sendboxWebhookRef } from "./sendbox-pure";
import type { Carrier, CarrierCredentials, CarrierJobInput, CarrierResult } from "./types";

// Sendbox (https://docs.sendbox.co): local shipments within Nigeria. One app access token, sent as the bare
// `Authorization` header (no "Bearer"; tokens don't expire):
//   1. Price: POST /shipping/shipment_delivery_quote → rates by service level (standard, premium, expedited).
//   2. Book: POST /shipping/shipments with the chosen rate's service_code → tracking_code. Paid from the Sendbox
//      wallet; a short wallet leaves it "drafted" (unpaid), which we refuse.
//   3. Status: POST /shipping/tracking { code }.
// Sendbox documents no cancel endpoint, so cancelling is done in the Sendbox dashboard. Its callbacks (the
// app's webhook URL, or callback_url per shipment) only make us re-read the status.
//
// Env: SENDBOX_ACCESS_TOKEN (required), SENDBOX_BASE_URL (default: staging, https://sandbox.staging.sendbox.co;
// live is https://live.sendbox.co).

const NAME = "Sendbox";

/** The account to use: a seller's own (creds), else Shopinbos's from the environment. */
function config(creds?: CarrierCredentials | null) {
  return {
    token: creds ? creds.accessToken?.trim() : process.env.SENDBOX_ACCESS_TOKEN?.trim(),
    baseUrl: (process.env.SENDBOX_BASE_URL?.trim() || SENDBOX_STAGING_URL).replace(/\/+$/, ""),
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || null,
  };
}

async function call(creds: CarrierCredentials | null | undefined, path: string, body?: unknown): Promise<CarrierResult<unknown>> {
  const { token, baseUrl } = config(creds);
  if (!token) return creds ? carrierSaid(NAME, "add your access token") : notSetUp(NAME, "SENDBOX_ACCESS_TOKEN");
  const res = await callJson(`${baseUrl}${path}`, { body, headers: { Authorization: token } });
  if ("error" in res) return carrierDown(NAME);
  if (!res.ok) return carrierSaid(NAME, errorMessage(res.json, "the request wasn't accepted"));
  return { ok: true, value: res.json };
}

async function rate(job: CarrierJobInput, creds?: CarrierCredentials | null) {
  const phones = needPhones(job);
  if (!phones.ok) return phones;
  const placed = await placeStops(job);
  if (!placed.ok) return placed;
  const { from, to } = placed.value;
  const pickupAt = pickupMoment(job);
  const res = await call(creds, "/shipping/shipment_delivery_quote", sendboxShipmentBody(job, from, to, pickupAt));
  if (!res.ok) return res;
  const picked = pickSendboxRate(res.value);
  if (!picked) return carrierSaid<never>(NAME, "no price for this route");
  return { ok: true as const, value: { picked, from, to, pickupAt } };
}

export const sendbox: Carrier = {
  id: "sendbox",
  name: NAME,

  credentialFields: [{ key: "accessToken", label: "Sendbox access token", secret: true }],

  configured() {
    return Boolean(config().token);
  },

  async verify(creds) {
    const res = await call(creds, "/payments/profile");
    return res.ok ? { ok: true, value: { label: `Token ${String(creds.accessToken ?? "").slice(0, 4)}…` } } : res;
  },

  async quote(job, creds) {
    const res = await rate(job, creds);
    return res.ok ? { ok: true, value: { price: res.value.picked.fee, currency: res.value.picked.currency } } : res;
  },

  async book(job, options) {
    const priced = await rate(job, options?.credentials);
    if (!priced.ok) return priced;
    const { picked, from, to, pickupAt } = priced.value;
    const tooDear = priceCheck<never>(NAME, picked.fee, picked.currency, options?.maxPrice);
    if (tooDear) return tooDear;
    const { appUrl } = config();
    const body = sendboxShipmentBody(job, from, to, pickupAt, { serviceCode: picked.code, callbackUrl: appUrl ? `${appUrl}/api/webhooks/carriers/sendbox` : null });
    const res = await call(options?.credentials, "/shipping/shipments", body);
    if (!res.ok) return res;
    const shipment = readSendboxShipment(res.value);
    if (!shipment) return carrierSaid(NAME, "the shipment was taken but no tracking code came back. Contact support before booking it again.");
    if (shipment.status === "drafted") {
      return carrierSaid(NAME, `the ${options?.credentials ? "" : "Shopinbos "}Sendbox wallet needs topping up. Shipment ${shipment.code} is on hold until it's paid in the Sendbox dashboard.`);
    }
    return {
      ok: true,
      value: { ref: shipment.code, jobIds: shipment.id ? [shipment.id] : [], trackingUrl: null, price: shipment.fee ?? picked.fee, currency: picked.currency },
    };
  },

  async cancel() {
    return carrierSaid(NAME, "cancelling isn't available through Sendbox's API yet. Cancel it in the Sendbox dashboard.");
  },

  async track(booking, creds) {
    const res = await call(creds, "/shipping/tracking", { code: booking.ref });
    if (!res.ok) return res;
    const raw = readSendboxStatus(res.value);
    return { ok: true, value: { status: sendboxBookingStatus(raw), raw: raw ?? "" } };
  },

  webhookRef: sendboxWebhookRef,
};
