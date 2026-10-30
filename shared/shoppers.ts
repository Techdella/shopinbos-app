// Shoppers: one record per customer phone number across Shopinbos, so the coming customer app (Plug) can show a person
// their past orders and shops when they sign in with the same number. Every order a seller takes creates or updates
// the record ("Shopper") and the person's link to that store ("ShopperStore"). Pure rules here; the database side is
// src/lib/shoppers.server.ts and scripts/backfill-shoppers.mjs.
//
// Privacy: a seller only ever sees their own orders. Nothing here (or built on it) tells a seller which other stores a
// shopper buys from.

import { areaFromText } from "./delivery-geo.ts";
import { DEFAULT_DIAL_COUNTRY, DIAL_COUNTRIES, toE164, type DialCountry } from "./phone.ts";

const NAME_MAX = 120;
const AREA_MAX = 120;
const STATE_MAX = 80;
const EMAIL_MAX = 200;

/** The country a store's local numbers ("0803…") belong to, from its currency. Nigeria otherwise. */
export function shopperDialCountry(currency: string | null | undefined): DialCountry {
  const code = ({ GHS: "GH", KES: "KE", ZAR: "ZA" } as Record<string, string>)[(currency ?? "").trim().toUpperCase()];
  return DIAL_COUNTRIES.find((country) => country.code === code) ?? DEFAULT_DIAL_COUNTRY;
}

/** An order's phone as E.164 ("0803 412 7790" → "+2348034127790"), or null when there's no usable number. */
export function shopperPhone(input: unknown, currency?: string | null): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  return toE164(input, shopperDialCountry(currency));
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

/**
 * Where the shopper is, from an order's deliveryAddress JSON ({ street, city, state, … }): a known area named in the
 * street or city ("12 Admiralty Way, Lekki" → "Lekki"), else what they typed as the city/area. Null when there's no
 * address (a sale handed over in person).
 */
export function shopperPlace(address: unknown): { area: string | null; state: string | null } {
  if (!address || typeof address !== "object" || Array.isArray(address)) return { area: null, state: null };
  const a = address as Record<string, unknown>;
  const city = text(a.city, AREA_MAX);
  const street = text(a.street, 300);
  const known = areaFromText([street, city].filter(Boolean).join(", "));
  return { area: known?.name ?? city, state: text(a.state, STATE_MAX) };
}

export interface ShopperOrderFacts {
  phone: string;
  name: string | null;
  email: string | null;
  area: string | null;
  state: string | null;
  at: Date;
  total: number;
}

/** What one order says about its shopper, or null when the order has no usable phone number (it is skipped). */
export function shopperFactsFromOrder(order: {
  buyerPhone?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  deliveryAddress?: unknown;
  total?: number | string | null;
  createdAt?: Date | string | null;
}, currency?: string | null): ShopperOrderFacts | null {
  const phone = shopperPhone(order.buyerPhone, currency);
  if (!phone) return null;
  const email = text(order.buyerEmail, EMAIL_MAX);
  const at = order.createdAt ? new Date(order.createdAt) : new Date();
  const total = Number(order.total);
  return {
    phone,
    name: text(order.buyerName, NAME_MAX),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
    ...shopperPlace(order.deliveryAddress),
    at: Number.isNaN(at.getTime()) ? new Date() : at,
    total: Number.isFinite(total) && total > 0 ? total : 0,
  };
}

export interface ShopperDetails {
  name: string | null;
  email: string | null;
  area: string | null;
  state: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/**
 * Merges an order into the shopper's details. The newest order's non-empty name, area and state win (an older order
 * arriving late, as in a backfill, only fills gaps); an email is kept once given and replaced only by a newer one.
 */
export function mergeShopper(existing: ShopperDetails | null, facts: ShopperOrderFacts): ShopperDetails {
  if (!existing) {
    return { name: facts.name, email: facts.email, area: facts.area, state: facts.state, firstSeenAt: facts.at, lastSeenAt: facts.at };
  }
  const newer = facts.at.getTime() >= existing.lastSeenAt.getTime();
  const pick = (current: string | null, incoming: string | null) => (newer ? incoming || current : current || incoming);
  return {
    name: pick(existing.name, facts.name),
    email: pick(existing.email, facts.email),
    area: pick(existing.area, facts.area),
    state: pick(existing.state, facts.state),
    firstSeenAt: facts.at < existing.firstSeenAt ? facts.at : existing.firstSeenAt,
    lastSeenAt: newer ? facts.at : existing.lastSeenAt,
  };
}

/** Folds many orders (any order) into one shopper's details, as the backfill does. */
export function shopperFromOrders(facts: ShopperOrderFacts[]): ShopperDetails | null {
  const sorted = [...facts].sort((a, b) => a.at.getTime() - b.at.getTime());
  return sorted.reduce<ShopperDetails | null>((details, item) => mergeShopper(details, item), null);
}
