import "server-only";

import { haversineMeters } from "@shared/delivery-geo";
import type { MarketOption } from "@shared/delivery-market";
import { geocodeAddress, type GeoResult } from "@/lib/logistics/geocode";

// How far each pickup point is from the customer, for checkout's "Change pickup point" list ("1.1 km"). The
// customer's area and each point's address are placed with the existing geocoder (GeocodeCache first, so a repeat
// costs one database read each). Each address is looked up once per request, and the whole thing waits at most
// `budgetMs`: lookups still running then are left to finish (and fill the cache) while the quote goes out without
// those distances. A point placed only by the centre of its area gets no distance (it would be a guess).

/** 1.1 km under 10 km, whole km above. */
export function roundKm(meters: number) {
  const km = meters / 1000;
  return km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
}

export async function withPointDistances<T extends MarketOption>(
  options: T[],
  address: { city?: string | null; state?: string | null },
  country?: string | null,
  budgetMs = 1500,
): Promise<T[]> {
  const points = options.filter((option) => option.kind === "pickup_point" && option.point?.address);
  const here = [address.city, address.state].map((part) => part?.trim()).filter(Boolean).join(", ");
  if (!points.length || !here) return options;

  const lookups = new Map<string, Promise<GeoResult | null>>();
  const place = (query: string) => {
    let found = lookups.get(query);
    if (!found) {
      found = geocodeAddress(query, country).catch(() => null);
      lookups.set(query, found);
    }
    return found;
  };

  const km = new Map<string, number>();
  const work = (async () => {
    const customer = await place(here);
    if (!customer) return;
    await Promise.all(
      points.map(async (option) => {
        const there = await place([option.point!.address, address.state].map((part) => part?.trim()).filter(Boolean).join(", "));
        if (there && there.source !== "area") km.set(option.id, roundKm(haversineMeters(customer, there)));
      }),
    );
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise((resolve) => { timer = setTimeout(resolve, budgetMs); })]);
  if (timer) clearTimeout(timer);

  if (!km.size) return options;
  return options.map((option) => (km.has(option.id) ? { ...option, distanceKm: km.get(option.id)! } : option));
}
