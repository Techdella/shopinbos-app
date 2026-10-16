// Kwik (https://apikwik.docs.apiary.io) without the network: request bodies, response reading and status mapping.
// Pure, unit-tested (tests/kwik-carrier.test.mjs). The client that calls Kwik is ./kwik.ts.
//
// Every Kwik response is { message, status, data } with HTTP 200 even on errors: "status" is the real outcome
// (200 done, 100 parameter missing, 101 invalid key, 201 show the message, 404 error in execution).

import type { JobStatus } from "../job-rules.ts";

export const KWIK_STAGING_URL = "https://staging-api-test.kwik.delivery";
export const KWIK_STAGING_DOMAIN = "staging-client-panel.kwik.delivery";

/** "status" values in Kwik's response body. */
export const KWIK_CODE = { PARAMETER_MISSING: 100, INVALID_KEY: 101, OK: 200, SHOW_ERROR: 201, ERROR: 404 } as const;

/** job_status of a Kwik task. */
export const KWIK_JOB = {
  UPCOMING: 0, // assigned to a rider
  STARTED: 1, // rider on the way
  ENDED: 2, // done
  FAILED: 3,
  ARRIVED: 4, // rider at the address
  UNASSIGNED: 6,
  ACCEPTED: 7, // rider accepted
  DECLINED: 8, // rider declined (Kwik offers it to another)
  CANCELLED: 9,
  DELETED: 10,
} as const;

/** job_type of a Kwik task: each order is a pickup task and a delivery task. */
export const KWIK_JOB_TYPE = { PICKUP: 0, DELIVERY: 1 } as const;

/** Pay from the Kwik wallet when it has funds, else end-of-month billing. */
export const KWIK_PAYMENT_WALLET_OR_EOMB = 524288;

export type KwikEnvelope<T = unknown> = { ok: true; data: T; message: string } | { ok: false; code: number; message: string };

/** Reads Kwik's { message, status, data } body. */
export function readKwik<T = unknown>(httpOk: boolean, json: unknown): KwikEnvelope<T> {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const code = Number(body.status);
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : "Kwik didn't accept the request.";
  if (httpOk && code === KWIK_CODE.OK) return { ok: true, data: body.data as T, message };
  return { ok: false, code: Number.isFinite(code) ? code : 0, message };
}

/**
 * Kwik's date format, "YYYY-MM-DD HH:MM:SS", in the local time of the given UTC offset (Lagos: +60 minutes). Kwik
 * takes the offset separately as `timezone`, with the sign flipped (kwikTimezone).
 */
export function kwikTime(date: Date, utcOffsetMinutes = 60) {
  const local = new Date(date.getTime() + utcOffsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
}

/** Kwik's `timezone`: the difference with UTC in minutes, positive west of UTC (Lagos, UTC+1: -60). */
export function kwikTimezone(utcOffsetMinutes = 60) {
  return utcOffsetMinutes === 0 ? 0 : -utcOffsetMinutes;
}

/** Kwik vehicle size for a parcel: 0 bike, 1 small, 2 medium, 3 large. No weight: a bike. */
export function kwikVehicleSize(weightKg?: number | null) {
  if (!weightKg || weightKg <= 20) return 0;
  if (weightKg <= 500) return 1;
  if (weightKg <= 2000) return 2;
  return 3;
}

/** Kwik wants phone numbers with the country code: "08031234567" → "+2348031234567". */
export function kwikPhone(phone: string | null | undefined, dialCode = "234") {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith(dialCode) && digits.length > 10) return `+${digits}`;
  if (digits.startsWith("0")) return `+${dialCode}${digits.slice(1)}`;
  return `+${dialCode}${digits}`;
}

export interface KwikStop {
  address: string;
  name: string;
  phone: string;
  email?: string | null;
  latitude: number;
  longitude: number;
  time: string;
}

export interface KwikAccount {
  accessToken: string;
  vendorId: number;
  userId: number;
  formId: number;
  customerId: number | null;
  domainName: string;
}

export interface KwikJobInput {
  pickup: KwikStop;
  delivery: KwikStop;
  vehicleId: number;
  timezone: number;
  /** Pay on delivery: the amount the rider collects. */
  codAmount?: number | null;
  instructions?: string | null;
  paymentMethod?: number;
  /** Ask the buyer for an OTP before handing over. */
  otp?: boolean;
}

const delivery = (stop: KwikStop) => ({ ...stop, email: stop.email ?? "", has_return_task: false, is_package_insured: 0 });
const pickup = (stop: KwikStop) => ({ ...stop, email: stop.email ?? "" });

/** Body for /send_payment_for_task (step 1 of pricing). */
export function kwikPricingBody(account: KwikAccount, input: KwikJobInput) {
  const cod = input.codAmount && input.codAmount > 0 ? input.codAmount : 0;
  return {
    custom_field_template: "pricing-template",
    pickup_custom_field_template: "pricing-template",
    access_token: account.accessToken,
    domain_name: account.domainName,
    timezone: input.timezone,
    vendor_id: account.vendorId,
    user_id: account.userId,
    form_id: account.formId,
    is_multiple_tasks: 1,
    layout_type: 0,
    has_pickup: 1,
    has_delivery: 1,
    auto_assignment: 1,
    payment_method: input.paymentMethod ?? KWIK_PAYMENT_WALLET_OR_EOMB,
    is_schedule_task: 0,
    pickups: [pickup(input.pickup)],
    deliveries: [delivery(input.delivery)],
    vehicle_id: input.vehicleId,
    delivery_instruction: input.instructions ?? "",
    delivery_images: "",
    is_loader_required: 0,
    loaders_amount: 0,
    loaders_count: 0,
    is_cod_job: cod ? 1 : 0,
    parcel_amount: cod,
  };
}

/** What /send_payment_for_task returns that the next two calls need. */
export interface KwikPricing {
  per_task_cost: string | number;
  insurance_amount?: number;
  total_no_of_tasks?: number;
  total_service_charge?: number;
  currency?: { code?: string };
  [key: string]: unknown;
}

/** Body for /get_bill_breakdown (step 2 of pricing: surge and the final amount). */
export function kwikBillBody(account: KwikAccount, input: KwikJobInput, pricing: KwikPricing, pickupTime: string) {
  const cod = input.codAmount && input.codAmount > 0 ? input.codAmount : 0;
  return {
    access_token: account.accessToken,
    domain_name: account.domainName,
    user_id: account.userId,
    form_id: account.formId,
    benefit_type: null,
    promo_value: null,
    credits: 0,
    amount: String(pricing.per_task_cost),
    insurance_amount: pricing.insurance_amount ?? 0,
    total_no_of_tasks: pricing.total_no_of_tasks ?? 1,
    total_service_charge: pricing.total_service_charge ?? 0,
    pickup_time: pickupTime,
    vehicle_id: input.vehicleId,
    delivery_instruction: input.instructions ?? "",
    delivery_images: "",
    is_loader_required: 0,
    loaders_amount: 0,
    loaders_count: 0,
    is_cod_job: cod ? 1 : 0,
    parcel_amount: cod,
    delivery_charge_by_buyer: 0,
  };
}

export interface KwikBill {
  PAYABLE_AMOUNT?: string | number;
  DISCOUNTED_AMOUNT?: string | number;
  ACTUAL_AMOUNT?: string | number;
  SURGE_PRICING?: number;
  SURGE_TYPE?: number;
  [key: string]: unknown;
}

const money = (value: unknown) => {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/**
 * The price of the delivery: what Kwik will charge (PAYABLE_AMOUNT, which carries the service charge and surge),
 * else the per-task cost plus the service charge.
 */
export function kwikPrice(pricing: KwikPricing, bill: KwikBill | null) {
  const fromBill = bill ? (money(bill.PAYABLE_AMOUNT) ?? money(bill.DISCOUNTED_AMOUNT)) : null;
  if (fromBill) return fromBill;
  const perTask = money(pricing.per_task_cost);
  if (!perTask) return null;
  return Math.round((perTask + (Number(pricing.total_service_charge) || 0)) * 100) / 100;
}

/** Body for /v2/create_task_via_vendor, carrying the pricing results as Kwik asks. */
export function kwikCreateBody(account: KwikAccount, input: KwikJobInput, pricing: KwikPricing, bill: KwikBill | null) {
  const cod = input.codAmount && input.codAmount > 0 ? input.codAmount : 0;
  return {
    domain_name: account.domainName,
    access_token: account.accessToken,
    vendor_id: account.vendorId,
    is_multiple_tasks: 1,
    fleet_id: "",
    latitude: 0,
    longitude: 0,
    timezone: input.timezone,
    has_pickup: 1,
    has_delivery: 1,
    pickup_delivery_relationship: 0,
    layout_type: 0,
    auto_assignment: 1,
    team_id: "",
    pickups: [pickup(input.pickup)],
    deliveries: [{ ...delivery(input.delivery), hadVairablePayment: 1, hadFixedPayment: 0, is_task_otp_required: input.otp ? 1 : 0 }],
    insurance_amount: pricing.insurance_amount ?? 0,
    total_no_of_tasks: pricing.total_no_of_tasks ?? 1,
    total_service_charge: pricing.total_service_charge ?? 0,
    payment_method: input.paymentMethod ?? KWIK_PAYMENT_WALLET_OR_EOMB,
    amount: String(pricing.per_task_cost),
    surge_cost: bill?.SURGE_PRICING ?? 0,
    surge_type: bill?.SURGE_TYPE ?? 0,
    delivery_instruction: input.instructions ?? "",
    delivery_images: "",
    is_loader_required: 0,
    loaders_amount: 0,
    loaders_count: 0,
    vehicle_id: input.vehicleId,
    is_cod_job: cod ? 1 : 0,
    parcel_amount: cod,
    is_task_otp_required: input.otp ? 1 : 0,
  };
}

export interface KwikCreated {
  ref: string;
  jobIds: number[];
  trackingUrl: string | null;
}

/** The order reference, job ids and tracking link from a create_task response. */
export function readKwikCreated(data: unknown): KwikCreated | null {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const ref = typeof d.unique_order_id === "string" && d.unique_order_id ? d.unique_order_id : null;
  if (!ref) return null;
  const tasks = [...(Array.isArray(d.pickups) ? d.pickups : []), ...(Array.isArray(d.deliveries) ? d.deliveries : [])] as Array<Record<string, unknown>>;
  const jobIds = tasks.map((t) => Number(t.job_id)).filter((id) => Number.isFinite(id) && id > 0);
  // The delivery task's link follows the parcel to the buyer's door.
  const deliveries = (Array.isArray(d.deliveries) ? d.deliveries : []) as Array<Record<string, unknown>>;
  const link = [...deliveries, ...tasks].map((t) => t.result_tracking_link).find((l) => typeof l === "string" && l.startsWith("https://"));
  return { ref, jobIds, trackingUrl: (link as string | undefined) ?? null };
}

export interface KwikTask {
  job_id: number;
  job_type: number;
  job_status: number;
}

/** The tasks of an order from /view_task_by_relationship_id. */
export function readKwikTasks(data: unknown): KwikTask[] {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const orders = (Array.isArray(d.orders) ? d.orders : []) as Array<Record<string, unknown>>;
  return orders
    .map((o) => ({ job_id: Number(o.job_id), job_type: Number(o.job_type), job_status: Number(o.job_status) }))
    .filter((t) => Number.isFinite(t.job_type) && Number.isFinite(t.job_status));
}

/** "pickup:2,delivery:1": Kwik's raw status, kept on the booking for support. */
export function kwikStatusLabel(tasks: KwikTask[]) {
  return tasks.map((t) => `${t.job_type === KWIK_JOB_TYPE.PICKUP ? "pickup" : "delivery"}:${t.job_status}`).join(",");
}

/**
 * Where a Kwik order is, as a Shopinbos job status, or null when Kwik says nothing useful yet.
 * Delivery task done → delivered, failed → failed, cancelled or deleted → cancelled; the rider on the way to the
 * buyer or at the door → in transit; the pickup done → picked up; any rider on it (or Kwik still finding one) →
 * confirmed, since Kwik took the job when it was created.
 */
export function kwikBookingStatus(tasks: KwikTask[]): JobStatus | null {
  if (!tasks.length) return null;
  const pickupTask = tasks.find((t) => t.job_type === KWIK_JOB_TYPE.PICKUP);
  const deliveryTask = tasks.find((t) => t.job_type === KWIK_JOB_TYPE.DELIVERY);
  const gone = (t?: KwikTask) => t?.job_status === KWIK_JOB.CANCELLED || t?.job_status === KWIK_JOB.DELETED;

  if (deliveryTask?.job_status === KWIK_JOB.ENDED) return "delivered";
  if (deliveryTask?.job_status === KWIK_JOB.FAILED || pickupTask?.job_status === KWIK_JOB.FAILED) return "failed";
  if (gone(deliveryTask) || gone(pickupTask)) return "cancelled";
  if (deliveryTask?.job_status === KWIK_JOB.STARTED || deliveryTask?.job_status === KWIK_JOB.ARRIVED) return "in_transit";
  if (pickupTask?.job_status === KWIK_JOB.ENDED) return "picked_up";
  return "confirmed";
}
