import "server-only";
import { db } from "@/lib/db/client";
import { checkRateLimitShared } from "@/lib/rate-limit";
import { areaFromText, geocodeCacheKey, isLatLng, type LatLng } from "@shared/delivery-geo";
import { findNgPostcode } from "@shared/ng-postcode";
import { lookupPostcode } from "@/lib/geo/nipost.server";

// Pickup coordinates for "closest rider". In order:
//   0. A NIPOST digital postcode written in the address (LA-11-W06-TC-10): the building's own point, when the
//      NIPOST key's lookup level returns one (src/lib/geo/nipost.server.ts, cached there).
//   1. GeocodeCache: every address is looked up once (hits and misses are stored; misses are retried after 7 days).
//   2. Google Geocoding when GOOGLE_MAPS_API_KEY is set.
//   3. Otherwise OpenStreetMap Nominatim, with the User-Agent its usage policy asks for and at most one request a
//      second across all instances (shared rate limit + a per-instance queue).
//   4. If neither places the address, the centre of the area it names ("…, Ikeja, Lagos" → Ikeja), not cached.
// GOOGLE_GEOCODE_BASE_URL / NOMINATIM_BASE_URL point at local stubs in tests. Never throws.

export type GeoSource = "nipost" | "google" | "nominatim" | "area";
export type GeoResult = LatLng & { source: GeoSource; label: string | null };

const USER_AGENT = "Shopinbos/1.0 (support@shopinbos.com)";
const MISS_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const NOMINATIM_GAP_MS = 1100;

const COUNTRY_CODES: Record<string, string> = { nigeria: "ng", ghana: "gh", kenya: "ke", "south africa": "za", uganda: "ug", tanzania: "tz", rwanda: "rw", "cote d'ivoire": "ci", senegal: "sn", cameroon: "cm" };

/** "Nigeria" / "NG" / "ng" → "ng". */
export function countryCode(country: string | null | undefined) {
  const value = (country ?? "").trim().toLowerCase();
  if (/^[a-z]{2}$/.test(value)) return value;
  return COUNTRY_CODES[value] ?? "ng";
}

function base(envName: string, fallback: string) {
  const value = process.env[envName]?.trim();
  return (value && /^https?:\/\//.test(value) ? value : fallback).replace(/\/+$/, "");
}

async function fromGoogle(address: string, cc: string): Promise<GeoResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;
  const url = `${base("GOOGLE_GEOCODE_BASE_URL", "https://maps.googleapis.com/maps/api/geocode")}/json?address=${encodeURIComponent(address)}&region=${cc}&components=country:${cc.toUpperCase()}&key=${encodeURIComponent(key)}`;
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const json = (await response.json().catch(() => null)) as { status?: string; results?: Array<{ formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }> } | null;
  const hit = json?.status === "OK" ? json.results?.[0] : undefined;
  const point = { lat: hit?.geometry?.location?.lat ?? NaN, lng: hit?.geometry?.location?.lng ?? NaN };
  return isLatLng(point) ? { ...point, source: "google", label: hit?.formatted_address ?? null } : null;
}

// One Nominatim request at a time per instance, at least 1.1 s apart; the shared limit keeps it to 1/s overall.
let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

function nominatimTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = lastNominatimAt + NOMINATIM_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    let allowed = (await checkRateLimitShared("geocode:nominatim", { maxRequests: 1, windowMs: 1000, sliding: false })).allowed;
    if (!allowed) {
      await new Promise((resolve) => setTimeout(resolve, NOMINATIM_GAP_MS));
      allowed = (await checkRateLimitShared("geocode:nominatim", { maxRequests: 1, windowMs: 1000, sliding: false })).allowed;
    }
    if (!allowed) throw new Error("nominatim busy");
    lastNominatimAt = Date.now();
    return work();
  });
  nominatimQueue = run.catch(() => undefined);
  return run;
}

async function fromNominatim(address: string, cc: string): Promise<GeoResult | null> {
  const url = `${base("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org")}/search?format=jsonv2&limit=1&countrycodes=${cc}&q=${encodeURIComponent(address)}`;
  return nominatimTurn(async () => {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`nominatim ${response.status}`);
    const json = (await response.json().catch(() => null)) as Array<{ lat?: string; lon?: string; display_name?: string }> | null;
    const hit = Array.isArray(json) ? json[0] : undefined;
    const point = { lat: Number(hit?.lat), lng: Number(hit?.lon) };
    return isLatLng(point) ? { ...point, source: "nominatim" as const, label: hit?.display_name ?? null } : null;
  });
}

function areaFallback(address: string): GeoResult | null {
  const area = areaFromText(address);
  return area ? { lat: area.lat, lng: area.lng, source: "area", label: area.name } : null;
}

/** Coordinates for an address, or null when nothing (not even its area) can be placed. */
export async function geocodeAddress(address: string, country?: string | null): Promise<GeoResult | null> {
  const query = address.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!query) return null;
  const cc = countryCode(country);
  if (cc === "ng") {
    const postcode = findNgPostcode(query);
    const record = postcode ? await lookupPostcode(postcode).catch(() => null) : null;
    if (record?.valid && record.point) return { ...record.point, source: "nipost", label: [record.locality, record.lgaName, record.stateName].filter(Boolean).join(", ") || postcode!.spaced };
  }
  const key = geocodeCacheKey(query, cc);

  const cached = await db.geocodeCache.findUnique({ where: { key } }).catch(() => null);
  if (cached && cached.lat !== null && cached.lng !== null) return { lat: cached.lat, lng: cached.lng, source: cached.source === "google" ? "google" : "nominatim", label: cached.label };
  if (cached && Date.now() - cached.updatedAt.getTime() < MISS_RETRY_MS) return areaFallback(query);

  const useGoogle = Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
  let found: GeoResult | null = null;
  try {
    found = useGoogle ? await fromGoogle(query, cc) : await fromNominatim(query, cc);
  } catch (error) {
    // Network trouble or the shared 1/s limit: don't cache, try again next time.
    console.warn(`[geocode] ${useGoogle ? "google" : "nominatim"} lookup skipped: ${error instanceof Error ? error.message : error}`);
    return areaFallback(query);
  }
  const source = useGoogle ? "google" : "nominatim";
  await db.geocodeCache
    .upsert({
      where: { key },
      create: { key, query, lat: found?.lat ?? null, lng: found?.lng ?? null, source, label: found?.label?.slice(0, 300) ?? null },
      update: { query, lat: found?.lat ?? null, lng: found?.lng ?? null, source, label: found?.label?.slice(0, 300) ?? null },
    })
    .catch(() => null);
  return found ?? areaFallback(query);
}

const RETRY_JOB_GEOCODE_MS = 6 * 60 * 60 * 1000;

/**
 * Pickup coordinates for these jobs, geocoding (and storing on the job) the ones that don't have them yet. At most
 * `limit` new lookups per call so a screen never waits long; the rest are done on later loads.
 */
export async function ensurePickupCoords(
  jobs: Array<{ id: string; pickupLocation: string; pickupLat: number | null; pickupLng: number | null; pickupGeoSource?: string | null; pickupGeocodedAt: Date | null }>,
  country?: string | null,
  limit = 3,
) {
  const result = new Map<string, LatLng>();
  let lookups = 0;
  for (const job of jobs) {
    const recent = Boolean(job.pickupGeocodedAt && Date.now() - job.pickupGeocodedAt.getTime() < RETRY_JOB_GEOCODE_MS);
    if (job.pickupLat !== null && job.pickupLng !== null) {
      result.set(job.id, { lat: job.pickupLat, lng: job.pickupLng });
      // Only the area's centre so far: try the real address again now and then.
      if (job.pickupGeoSource !== "area" || recent || lookups >= limit) continue;
    } else if (recent || lookups >= limit) continue;
    lookups += 1;
    const found = await geocodeAddress(job.pickupLocation, country).catch(() => null);
    await db.deliveryBooking
      .update({
        where: { id: job.id },
        data: found ? { pickupLat: found.lat, pickupLng: found.lng, pickupGeoSource: found.source, pickupGeocodedAt: new Date() } : { pickupGeocodedAt: new Date() },
      })
      .catch(() => null);
    if (found) result.set(job.id, { lat: found.lat, lng: found.lng });
  }
  return result;
}

export const PICKUP_GEO_SELECT = { pickupLat: true, pickupLng: true, pickupGeoSource: true, pickupGeocodedAt: true } as const;
