// "Suppliers near my customers" (spec gap C2b): a Find filter for suppliers close to where the seller's customers
// are, not to where the seller is. Where the customers are comes from the seller's recent orders (the delivery
// state and LGA/area of the last 90 days); a shop without orders yet falls back on its own state. A supplier is near
// them when it ships within the same city/LGA, the same state or the next-door states (the same geopolitical zone,
// shared/dropship-rules.ts deliveryZone) of one of those places, and, when it uses its own delivery rate card, it
// prices that zone. Pure, unit-tested in tests/dropship-marketplace.test.mjs.

import { deliveryZone, readZoneRates, zoneRatesEmpty, type DeliveryZone } from "./dropship-rules.ts";
import { placeOf, type NgState, type Place } from "./delivery-market.ts";

export const CUSTOMER_DAYS = 90;
/** Customers' states (and areas) that count: the busiest few. */
export const CUSTOMER_STATES_MAX = 3;
export const CUSTOMER_AREAS_MAX = 5;
/** Zones that count as "near my customers". */
export const NEAR_ZONES: readonly DeliveryZone[] = ["same_city", "same_state", "nearby"];

export interface CustomerPlaces {
  /** The busiest delivery states, most orders first. */
  states: NgState[];
  /** The busiest areas (LGA or city) with their state. */
  areas: Place[];
  /** orders: from recent orders; store: the shop's own state (no orders yet); none: nothing to go on. */
  basis: "orders" | "store" | "none";
}

const areaKey = (place: Place) => `${place.state}|${(place.area ?? "").trim().toLowerCase()}`;

/** Where the customers are, from the delivery addresses of recent orders (RetailOrder.deliveryAddress). */
export function customerPlacesFrom(addresses: ReadonlyArray<unknown>, fallbackState: NgState | string | null | undefined): CustomerPlaces {
  const states = new Map<NgState, number>();
  const areas = new Map<string, { place: Place; count: number }>();
  for (const raw of addresses) {
    const address = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const place = placeOf({ state: str(address.state), city: str(address.lga) || str(address.city), area: str(address.area) || str(address.lga) || null });
    if (!place.state) continue;
    states.set(place.state, (states.get(place.state) ?? 0) + 1);
    if (place.area) {
      const key = areaKey(place);
      areas.set(key, { place, count: (areas.get(key)?.count ?? 0) + 1 });
    }
  }
  if (states.size) {
    return {
      states: [...states.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, CUSTOMER_STATES_MAX).map(([state]) => state),
      areas: [...areas.values()].sort((a, b) => b.count - a.count).slice(0, CUSTOMER_AREAS_MAX).map((entry) => entry.place),
      basis: "orders",
    };
  }
  const fallback = fallbackState ? placeOf({ state: fallbackState }).state : null;
  return fallback ? { states: [fallback], areas: [], basis: "store" } : { states: [], areas: [], basis: "none" };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface SupplierReach {
  /** Where the supplier ships from (its pickup/origin, else its city). */
  origin: Place;
  /** The supplier's DeliverySettings: rateSource "own" with zoneRates means only priced zones are delivered. */
  rateSource?: string | null;
  zoneRates?: unknown;
}

/** The closest zone from this supplier to any of the customers' places, or null when none is near (or nothing to go on). */
export function nearestCustomerZone(supplier: SupplierReach, customers: CustomerPlaces): DeliveryZone | null {
  if (!supplier.origin.state || !customers.states.length) return null;
  const own = supplier.rateSource === "own" && !zoneRatesEmpty(readZoneRates(supplier.zoneRates));
  const rates = own ? readZoneRates(supplier.zoneRates) : null;
  const places: Place[] = [...customers.areas, ...customers.states.map((state) => ({ state, area: null }))];
  let best: DeliveryZone | null = null;
  for (const place of places) {
    const zone = deliveryZone(supplier.origin, place);
    if (!zone || !NEAR_ZONES.includes(zone)) continue;
    // Its own rate card leaves this zone empty: it doesn't deliver there.
    if (rates && !Object.values(rates[zone]).some((price) => typeof price === "number")) continue;
    if (best === null || NEAR_ZONES.indexOf(zone) < NEAR_ZONES.indexOf(best)) best = zone;
  }
  return best;
}

export function nearMyCustomers(supplier: SupplierReach, customers: CustomerPlaces): boolean {
  return nearestCustomerZone(supplier, customers) !== null;
}
