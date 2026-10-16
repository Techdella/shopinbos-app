import "server-only";
import { geocodeAddress } from "../geocode";
import {
  KWIK_CODE,
  KWIK_STAGING_DOMAIN,
  KWIK_STAGING_URL,
  kwikBillBody,
  kwikBookingStatus,
  kwikCreateBody,
  kwikPhone,
  kwikPrice,
  kwikPricingBody,
  kwikStatusLabel,
  kwikTime,
  kwikTimezone,
  kwikVehicleSize,
  readKwik,
  readKwikCreated,
  readKwikTasks,
  type KwikAccount,
  type KwikBill,
  type KwikEnvelope,
  type KwikJobInput,
  type KwikPricing,
} from "./kwik-pure";
import type { Carrier, CarrierJobInput, CarrierResult } from "./types";

// Kwik (https://apikwik.docs.apiary.io), Lagos same-day delivery. We book as one Kwik business account:
//   1. POST /vendor_login with the account's email and password → access_token, vendor_id, user_id, form_id.
//   2. Price: POST /send_payment_for_task, then POST /get_bill_breakdown (adds surge) → the amount Kwik charges.
//   3. Book: POST /v2/create_task_via_vendor with both pricing results → unique_order_id and a tracking link.
//   4. Where is it: GET /view_task_by_relationship_id (the pickup and delivery tasks' job_status).
//   5. Cancel: POST /cancel_vendor_task with job_status 9.
// Paid from the account's Kwik wallet, else end-of-month billing (KWIK_PAYMENT_METHOD to change it).
//
// Env: KWIK_EMAIL and KWIK_PASSWORD (required), KWIK_BASE_URL and KWIK_DOMAIN_NAME (default: Kwik's staging API and
// client panel; set https://api.kwik.delivery and app.kwik.delivery, or what Kwik gives you, for live),
// KWIK_VEHICLE_ID (optional: always use this vehicle instead of picking one by parcel weight).

const LAGOS_UTC_OFFSET = 60;
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
/** A rider can't be at the pickup sooner than this. */
const PICKUP_LEAD_MS = 10 * 60 * 1000;
/** Kwik asks for a delivery time too; it's a target, not a promise. */
const DELIVERY_AFTER_PICKUP_MS = 2 * 60 * 60 * 1000;
/** Our own code for "no credentials", next to Kwik's (0 is "couldn't reach Kwik"). */
const NOT_SET_UP = -1;

function config() {
  const email = process.env.KWIK_EMAIL?.trim();
  const password = process.env.KWIK_PASSWORD?.trim();
  return {
    email,
    password,
    baseUrl: (process.env.KWIK_BASE_URL?.trim() || KWIK_STAGING_URL).replace(/\/+$/, ""),
    domainName: process.env.KWIK_DOMAIN_NAME?.trim() || KWIK_STAGING_DOMAIN,
    vehicleId: Number(process.env.KWIK_VEHICLE_ID) || null,
    paymentMethod: Number(process.env.KWIK_PAYMENT_METHOD) || undefined,
  };
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string | number> }): Promise<KwikEnvelope<T>> {
  const { baseUrl } = config();
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, String(value));
  const res = await fetch(url, {
    method: init.method,
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, code: 0, message: `Couldn't reach Kwik: ${res.message || "network error"}` };
  const json = await res.json().catch(() => ({}));
  return readKwik<T>(res.ok, json);
}

// ─── Login ────────────────────────────────────────────────────────────────────

let session: { account: KwikAccount; until: number } | null = null;
let loggingIn: Promise<KwikEnvelope<KwikAccount>> | null = null;

async function login(): Promise<KwikEnvelope<KwikAccount>> {
  const { email, password, domainName } = config();
  if (!email || !password) return { ok: false, code: NOT_SET_UP, message: "Kwik isn't set up (KWIK_EMAIL and KWIK_PASSWORD)." };
  const res = await call<Record<string, unknown>>("/vendor_login", { method: "POST", body: { domain_name: domainName, email, password, api_login: 1 } });
  if (!res.ok) return res;
  const vendor = (res.data?.vendor_details ?? {}) as Record<string, unknown>;
  const forms = (Array.isArray(res.data?.formSettings) ? res.data.formSettings : []) as Array<Record<string, unknown>>;
  const accessToken = String(res.data?.access_token ?? vendor.access_token ?? "");
  const vendorId = Number(vendor.vendor_id);
  if (!accessToken || !Number.isFinite(vendorId)) return { ok: false, code: 0, message: "Kwik's login didn't return an access token." };
  return {
    ok: true,
    message: res.message,
    data: {
      accessToken,
      vendorId,
      userId: Number(vendor.user_id ?? forms[0]?.user_id) || 1,
      // Kwik: "can be hardcoded because it doesn't change on every login. It will always be 2."
      formId: Number(forms[0]?.form_id) || 2,
      customerId: Number(vendor.customer_id) || null,
      domainName,
    },
  };
}

async function account(fresh = false): Promise<KwikEnvelope<KwikAccount>> {
  if (!fresh && session && session.until > Date.now()) return { ok: true, data: session.account, message: "" };
  loggingIn ??= login().finally(() => (loggingIn = null));
  const res = await loggingIn;
  session = res.ok ? { account: res.data, until: Date.now() + TOKEN_TTL_MS } : null;
  return res;
}

/** Calls Kwik with the logged-in account, logging in again once when Kwik says the token is no longer valid. */
async function withAccount<T>(run: (acct: KwikAccount) => Promise<KwikEnvelope<T>>): Promise<KwikEnvelope<T>> {
  const first = await account();
  if (!first.ok) return first;
  const res = await run(first.data);
  if (res.ok || res.code !== KWIK_CODE.INVALID_KEY) return res;
  const again = await account(true);
  return again.ok ? run(again.data) : again;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

const fail = <T>(code: "NOT_CONFIGURED" | "BAD_ADDRESS" | "PRICE_CHANGED" | "REJECTED" | "UNAVAILABLE", error: string): CarrierResult<T> => ({ ok: false, code, error });
const fromKwik = <T>(res: { ok: false; code: number; message: string }): CarrierResult<T> => {
  if (res.code === NOT_SET_UP) return fail("NOT_CONFIGURED", res.message);
  if (res.code === 0) return fail("UNAVAILABLE", "Kwik isn't answering right now. Try again in a minute.");
  return fail("REJECTED", `Kwik: ${res.message}`);
};

async function vehicleFor(weightKg?: number | null): Promise<KwikEnvelope<number>> {
  const fixed = config().vehicleId;
  if (fixed) return { ok: true, data: fixed, message: "" };
  const res = await withAccount((acct) =>
    call<Array<{ vehicle_id: number; is_deleted?: number }>>("/getVehicle", {
      method: "GET",
      query: { access_token: acct.accessToken, is_vendor: 1, size: kwikVehicleSize(weightKg) },
    }),
  );
  if (!res.ok) return res;
  const id = (Array.isArray(res.data) ? res.data : []).find((v) => !v.is_deleted && Number.isFinite(v.vehicle_id))?.vehicle_id;
  return id ? { ok: true, data: id, message: "" } : { ok: false, code: KWIK_CODE.ERROR, message: "no vehicle for this parcel right now" };
}

type Prepared = { input: KwikJobInput; pickupTime: string };

async function prepare(job: CarrierJobInput): Promise<CarrierResult<Prepared>> {
  const pickupPhone = kwikPhone(job.pickup.phone);
  const dropoffPhone = kwikPhone(job.dropoff.phone);
  if (!pickupPhone) return fail("BAD_ADDRESS", "Add a phone number for the pickup so the rider can call.");
  if (!dropoffPhone) return fail("BAD_ADDRESS", "Add the customer's phone number so the rider can call them.");
  const [from, to] = await Promise.all([geocodeAddress(job.pickup.address, "Nigeria").catch(() => null), geocodeAddress(job.dropoff.address, "Nigeria").catch(() => null)]);
  if (!from) return fail("BAD_ADDRESS", "We couldn't find the pickup address on the map. Add the street and area.");
  if (!to) return fail("BAD_ADDRESS", "We couldn't find the delivery address on the map. Add the street and area.");
  const vehicle = await vehicleFor(job.weightKg);
  if (!vehicle.ok) return fromKwik(vehicle);
  const vehicleId = vehicle.data;

  const now = Date.now();
  const pickupAt = job.pickupAt && job.pickupAt.getTime() > now + PICKUP_LEAD_MS ? job.pickupAt : new Date(now + PICKUP_LEAD_MS);
  const pickupTime = kwikTime(pickupAt, LAGOS_UTC_OFFSET);
  const deliveryTime = kwikTime(new Date(pickupAt.getTime() + DELIVERY_AFTER_PICKUP_MS), LAGOS_UTC_OFFSET);
  return {
    ok: true,
    value: {
      pickupTime,
      input: {
        pickup: { address: job.pickup.address, name: job.pickup.name, phone: pickupPhone, email: job.pickup.email, latitude: from.lat, longitude: from.lng, time: pickupTime },
        delivery: { address: job.dropoff.address, name: job.dropoff.name, phone: dropoffPhone, email: job.dropoff.email, latitude: to.lat, longitude: to.lng, time: deliveryTime },
        vehicleId,
        timezone: kwikTimezone(LAGOS_UTC_OFFSET),
        codAmount: job.codAmount,
        instructions: job.notes?.slice(0, 500) ?? "",
        paymentMethod: config().paymentMethod,
      },
    },
  };
}

type Priced = { pricing: KwikPricing; bill: KwikBill | null; price: number; currency: string };

async function price(acct: KwikAccount, prepared: Prepared): Promise<KwikEnvelope<Priced>> {
  const step1 = await call<KwikPricing>("/send_payment_for_task", { method: "POST", body: kwikPricingBody(acct, prepared.input) });
  if (!step1.ok) return step1;
  const step2 = await call<KwikBill>("/get_bill_breakdown", { method: "POST", body: kwikBillBody(acct, prepared.input, step1.data, prepared.pickupTime) });
  // Without the breakdown the price misses surge, but the job can still be priced from step 1.
  const bill = step2.ok ? step2.data : null;
  if (!step2.ok && step2.code === KWIK_CODE.INVALID_KEY) return step2;
  const amount = kwikPrice(step1.data, bill);
  if (!amount) return { ok: false, code: KWIK_CODE.ERROR, message: "Kwik didn't return a price for this route." };
  return { ok: true, message: "", data: { pricing: step1.data, bill, price: amount, currency: step1.data.currency?.code || "NGN" } };
}

/** Prices the job with the logged-in account (logging in again once if the token went stale). */
async function priced(job: CarrierJobInput): Promise<CarrierResult<{ acct: KwikAccount; prepared: Prepared; priced: Priced }>> {
  const prepared = await prepare(job);
  if (!prepared.ok) return prepared;
  let acct: KwikAccount | null = null;
  const res = await withAccount((current) => {
    acct = current;
    return price(current, prepared.value);
  });
  if (!res.ok) return fromKwik(res);
  return { ok: true, value: { acct: acct!, prepared: prepared.value, priced: res.data } };
}

export const kwik: Carrier = {
  id: "kwik",
  name: "Kwik",

  configured() {
    const { email, password } = config();
    return Boolean(email && password);
  },

  async quote(job) {
    const res = await priced(job);
    if (!res.ok) return res;
    return { ok: true, value: { price: res.value.priced.price, currency: res.value.priced.currency } };
  },

  async book(job, options) {
    const res = await priced(job);
    if (!res.ok) return res;
    const { acct, prepared, priced: p } = res.value;
    if (options?.maxPrice != null && p.price > options.maxPrice + 0.005) {
      return fail("PRICE_CHANGED", `Kwik's price for this delivery is now ${p.currency} ${p.price.toLocaleString("en-NG")}. Check the new price and book again.`);
    }
    const created = await call<unknown>("/v2/create_task_via_vendor", { method: "POST", body: kwikCreateBody(acct, prepared.input, p.pricing, p.bill) });
    if (!created.ok) {
      if (created.code === KWIK_CODE.INVALID_KEY) session = null;
      return fromKwik(created);
    }
    const order = readKwikCreated(created.data);
    if (!order) return fail("REJECTED", "Kwik took the job but didn't return an order number. Contact support before booking it again.");
    return { ok: true, value: { ref: order.ref, jobIds: order.jobIds, trackingUrl: order.trackingUrl, price: p.price, currency: p.currency } };
  },

  async cancel(booking) {
    const ids = booking.jobIds.map(String).filter(Boolean);
    if (!ids.length) return fail("REJECTED", "This Kwik job has no task ids to cancel.");
    const res = await withAccount((acct) =>
      call<unknown>("/cancel_vendor_task", {
        method: "POST",
        body: { access_token: acct.accessToken, vendor_id: acct.vendorId, domain_name: acct.domainName, job_id: ids.join(","), job_status: 9 },
      }),
    );
    if (!res.ok) return fromKwik(res);
    return { ok: true, value: null };
  },

  async track(booking) {
    const res = await withAccount((acct) =>
      call<unknown>("/view_task_by_relationship_id", { method: "GET", query: { access_token: acct.accessToken, unique_order_id: booking.ref } }),
    );
    if (!res.ok) return fromKwik(res);
    const tasks = readKwikTasks(res.data);
    return { ok: true, value: { status: kwikBookingStatus(tasks), raw: kwikStatusLabel(tasks) } };
  },
};
