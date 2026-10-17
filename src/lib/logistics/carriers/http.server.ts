import "server-only";
import { geocodeAddress, type GeoResult } from "../geocode";
import type { CarrierJobInput, CarrierResult } from "./types";

// What every carrier client shares: a JSON fetch that never throws, and placing both ends of a job on the map.

export type HttpResult = { ok: boolean; status: number; json: unknown } | { error: string };

export async function callJson(url: string | URL, init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number } = {}): Promise<HttpResult> {
  const res = await fetch(url, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }), ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
    cache: "no-store",
  }).catch((error: Error) => error);
  if (res instanceof Error) return { error: res.message || "network error" };
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Coordinates of both ends of a job, or a BAD_ADDRESS error naming the end we couldn't place. */
export async function placeStops(job: CarrierJobInput): Promise<CarrierResult<{ from: GeoResult; to: GeoResult }>> {
  const [from, to] = await Promise.all([geocodeAddress(job.pickup.address, "Nigeria").catch(() => null), geocodeAddress(job.dropoff.address, "Nigeria").catch(() => null)]);
  if (!from) return { ok: false, code: "BAD_ADDRESS", error: "We couldn't find the pickup address on the map. Add the street and area." };
  if (!to) return { ok: false, code: "BAD_ADDRESS", error: "We couldn't find the delivery address on the map. Add the street and area." };
  return { ok: true, value: { from, to } };
}

/** The phones both ends need, or a BAD_ADDRESS error saying which is missing. */
export function needPhones(job: CarrierJobInput): CarrierResult<null> {
  if (!job.pickup.phone.trim()) return { ok: false, code: "BAD_ADDRESS", error: "Add a phone number for the pickup so the rider can call." };
  if (!job.dropoff.phone.trim()) return { ok: false, code: "BAD_ADDRESS", error: "Add the customer's phone number so the rider can call them." };
  return { ok: true, value: null };
}

/** A carrier that didn't answer, or answered with an error message. */
export function carrierDown<T>(name: string): CarrierResult<T> {
  return { ok: false, code: "UNAVAILABLE", error: `${name} isn't answering right now. Try again in a minute.` };
}

export function carrierSaid<T>(name: string, message: string): CarrierResult<T> {
  return { ok: false, code: "REJECTED", error: `${name}: ${message}` };
}

export function notSetUp<T>(name: string, vars: string): CarrierResult<T> {
  return { ok: false, code: "NOT_CONFIGURED", error: `${name} isn't set up (${vars}).` };
}

/** "Something went wrong" from a carrier's error body: message, description or the first validation error. */
export function errorMessage(json: unknown, fallback: string) {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  for (const key of ["message", "description", "error", "title"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
  }
  const first = Object.values(body).find((v) => Array.isArray(v) && typeof v[0] === "string") as string[] | undefined;
  return first?.[0]?.slice(0, 300) ?? fallback;
}

/** When the rider should come: the asked time if it's at least 10 minutes away, else 10 minutes from now. */
export function pickupMoment(job: CarrierJobInput, now = Date.now()) {
  const lead = now + 10 * 60_000;
  return job.pickupAt && job.pickupAt.getTime() > lead ? job.pickupAt : new Date(lead);
}

/** PRICE_CHANGED when the live price is above what the seller agreed to. */
export function priceCheck<T>(name: string, price: number, currency: string, maxPrice?: number | null): CarrierResult<T> | null {
  if (maxPrice == null || price <= maxPrice + 0.005) return null;
  return { ok: false, code: "PRICE_CHANGED", error: `${name}'s price for this delivery is now ${currency} ${price.toLocaleString("en-NG")}. Check the new price and book again.` };
}
