import "server-only";
import { randomUUID } from "node:crypto";
import { callJson, carrierDown, carrierSaid, errorMessage, needPhones, notSetUp, pickupMoment, priceCheck } from "./http.server";
import { FEZ_SANDBOX_URL, fezBookingStatus, fezCostBody, fezOk, fezOrderBody, fezWebhookRef, readFezCost, readFezLogin, readFezOrderNo, readFezTrack } from "./fez-pure";
import type { Carrier, CarrierCredentials, CarrierJobInput, CarrierResult } from "./types";

// Fez Delivery (https://fez-delivery-co.gitbook.io/fezcorporate-api-docs): parcels within a state and across
// Nigeria, with pay on delivery. We book as one Fez business account:
//   1. POST /user/authenticate { user_id, password } → authToken (with its expiry) and the org's secret-key; every
//      other call sends `Authorization: Bearer <authToken>` and `secret-key`.
//   2. Price: POST /order/cost { state, pickUpState, weight } → totalCost (cost plus VAT).
//   3. Book: POST /order [ { recipient…, uniqueID, BatchID, valueOfItem, weight, sender… } ] → orderNos[uniqueID].
//   4. Status: GET /order/track/{orderNo}. 5. Cancel: POST /order/cancel { orderNo, reason } (before pickup only).
// Webhooks (POST /webhooks/store) send { orderNumber, status }: we only use them to re-read the status.
//
// Two ways in: the API key and secret key from the Fez business portal (Developers → Manage API Key), sent as they
// are with no login; or the user ID and password Fez shares after KYC, logged in as in step 1.
// Env: FEZ_API_KEY and FEZ_SECRET_KEY, or FEZ_USER_ID and FEZ_PASSWORD; FEZ_BASE_URL (default: the sandbox; Fez
// gives you the live URL).

const NAME = "Fez";

/** The account to use: a seller's own (creds), else Shopinbos's from the environment. */
function config(creds?: CarrierCredentials | null) {
  return {
    apiKey: creds ? creds.apiKey?.trim() : process.env.FEZ_API_KEY?.trim(),
    secretKey: creds ? creds.secretKey?.trim() : process.env.FEZ_SECRET_KEY?.trim(),
    userId: creds ? creds.userId?.trim() : process.env.FEZ_USER_ID?.trim(),
    password: creds ? creds.password?.trim() : process.env.FEZ_PASSWORD?.trim(),
    baseUrl: (process.env.FEZ_BASE_URL?.trim() || FEZ_SANDBOX_URL).replace(/\/+$/, ""),
  };
}

// One login per account (Shopinbos's and each seller's own), reused until its token expires.
const sessions = new Map<string, { token: string; secret: string; until: number }>();

async function login(creds: CarrierCredentials | null | undefined, fresh = false): Promise<CarrierResult<{ token: string; secret: string; fixed: boolean }>> {
  const { apiKey, secretKey, userId, password, baseUrl } = config(creds);
  if (apiKey && secretKey) return { ok: true, value: { token: apiKey, secret: secretKey, fixed: true } };
  if (!userId || !password) return creds ? carrierSaid(NAME, "add your Fez API key and secret key") : notSetUp(NAME, "FEZ_API_KEY and FEZ_SECRET_KEY (or FEZ_USER_ID and FEZ_PASSWORD)");
  const session = sessions.get(userId);
  if (!fresh && session && session.until > Date.now()) return { ok: true, value: { ...session, fixed: false } };
  const res = await callJson(`${baseUrl}/user/authenticate`, { body: { user_id: userId, password } });
  if ("error" in res) return carrierDown(NAME);
  const auth = fezOk(res.ok, res.json) ? readFezLogin(res.json) : null;
  if (!auth) return carrierSaid(NAME, errorMessage(res.json, "login failed"));
  sessions.set(userId, auth);
  return { ok: true, value: { ...auth, fixed: false } };
}

/** A call with the account's token, logging in again once when Fez says it's no longer valid (portal keys don't expire). */
async function call(creds: CarrierCredentials | null | undefined, path: string, init: { method?: string; body?: unknown } = {}): Promise<CarrierResult<unknown>> {
  for (const fresh of [false, true]) {
    const auth = await login(creds, fresh);
    if (!auth.ok) return auth;
    const res = await callJson(`${config().baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${auth.value.token}`, "secret-key": auth.value.secret } });
    if ("error" in res) return carrierDown(NAME);
    if (res.status === 401 && auth.value.fixed) return carrierSaid(NAME, "the API key or secret key wasn't accepted");
    if (res.status === 401 && !fresh) continue;
    if (!fezOk(res.ok, res.json)) return carrierSaid(NAME, errorMessage(res.json, "the request wasn't accepted"));
    return { ok: true, value: res.json };
  }
  return carrierDown(NAME);
}

async function quote(job: CarrierJobInput, creds?: CarrierCredentials | null): Promise<CarrierResult<{ price: number; currency: string }>> {
  const phones = needPhones(job);
  if (!phones.ok) return phones;
  const res = await call(creds, "/order/cost", { body: fezCostBody(job) });
  if (!res.ok) return res;
  const price = readFezCost(res.value);
  return price ? { ok: true, value: { price, currency: "NGN" } } : carrierSaid(NAME, "no price for this route");
}

export const fez: Carrier = {
  id: "fez",
  name: NAME,

  // What a seller sees in their Fez business portal (Developers → Manage API Key).
  credentialFields: [
    { key: "apiKey", label: "Fez API key", secret: true },
    { key: "secretKey", label: "Fez secret key", secret: true },
  ],

  configured() {
    const { apiKey, secretKey, userId, password } = config();
    return Boolean((apiKey && secretKey) || (userId && password));
  },

  async verify(creds) {
    // Portal keys need a real call to be checked: a price for a small parcel within Lagos.
    const { apiKey, userId } = config(creds);
    const res = apiKey ? await call(creds, "/order/cost", { body: { state: "Lagos", pickUpState: "Lagos", weight: 1 } }) : await login(creds, true);
    if (!res.ok) return res;
    return { ok: true, value: { label: userId ?? `Fez key …${apiKey?.slice(-4) ?? ""}` } };
  },

  quote,

  async book(job, options) {
    const priced = await quote(job, options?.credentials);
    if (!priced.ok) return priced;
    const tooDear = priceCheck<never>(NAME, priced.value.price, priced.value.currency, options?.maxPrice);
    if (tooDear) return tooDear;
    const uniqueId = `SIB-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
    const res = await call(options?.credentials, "/order", { body: fezOrderBody(job, uniqueId, pickupMoment(job)) });
    if (!res.ok) return res;
    const orderNo = readFezOrderNo(res.value, uniqueId);
    if (!orderNo) return carrierSaid(NAME, "the order was taken but no order number came back. Contact support before booking it again.");
    return { ok: true, value: { ref: orderNo, jobIds: [uniqueId], trackingUrl: null, ...priced.value } };
  },

  async cancel(booking, creds) {
    const res = await call(creds, "/order/cancel", { body: { orderNo: booking.ref, reason: "Cancelled by the shop" } });
    return res.ok ? { ok: true, value: null } : res;
  },

  async track(booking, creds) {
    const res = await call(creds, `/order/track/${encodeURIComponent(booking.ref)}`, { method: "GET" });
    if (!res.ok) return res;
    const raw = readFezTrack(res.value);
    return { ok: true, value: { status: fezBookingStatus(raw), raw: raw ?? "" } };
  },

  webhookRef: fezWebhookRef,
};
