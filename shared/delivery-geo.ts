// Delivery geography shared by the web app and the Riders / Partners mobile app. Pure (no imports), unit-tested in
// tests/payins-and-riders.test.mjs:
//   - haversine distance, plain distance words ("1.2 km away", "about 5 min");
//   - the rider picker order (free and out, then busy, then offline; fresh locations first; closest first);
//   - when the Riders app sends a location (every ~60 s, or after moving 100 m);
//   - "last seen 2 min ago, Ikeja" (nearest known area, so a partner never needs raw coordinates);
//   - the geocode cache key and the area-name fallback when no geocoder answers.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function isLatLng(value: Partial<LatLng> | null | undefined): value is LatLng {
  return (
    !!value &&
    typeof value.lat === "number" &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  );
}

/** Straight-line distance in metres between two points (haversine). */
export function haversineMeters(a: LatLng, b: LatLng) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "450 m away", "1.2 km away", "14 km away". */
export function distanceWords(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m away`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1).replace(/\.0$/, "") : Math.round(km)} km away`;
}

/**
 * "about 5 min" by bike in city traffic: roads are ~1.3× the straight line and a bike averages ~20 km/h in Lagos.
 * A guide for the dispatcher, not a promise.
 */
export function etaWords(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return "";
  const minutes = Math.max(1, Math.ceil(((meters * 1.3) / 20_000) * 60));
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round((minutes % 60) / 5) * 5;
  return rest ? `about ${hours} hr ${rest} min` : `about ${hours} hr`;
}

/** "just now", "2 min ago", "1 hr ago", "yesterday", "3 days ago". */
export function lastSeenWords(at: Date | string | null | undefined, now: Date = new Date()) {
  if (!at) return "not seen yet";
  const time = typeof at === "string" ? new Date(at).getTime() : at.getTime();
  if (!Number.isFinite(time)) return "not seen yet";
  const minutes = Math.floor((now.getTime() - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** A location counts as fresh for "closest rider" for 10 minutes. */
export const FRESH_LOCATION_MS = 10 * 60 * 1000;
/** Same window as job-rules RIDER_ONLINE_WINDOW_MS: online and the app was open in the last 30 minutes. */
export const RIDER_OUT_WINDOW_MS = 30 * 60 * 1000;

export interface PickerRider {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: Date | string | null;
  openJobs: number;
  lat?: number | null;
  lng?: number | null;
  locationAt?: Date | string | null;
}

export interface RankedRider<T extends PickerRider> {
  rider: T;
  /** 0 free and out, 1 out but busy, 2 offline */
  group: 0 | 1 | 2;
  fresh: boolean;
  meters: number | null;
  /** "1.2 km away · about 5 min", or "" when we can't tell. */
  distanceText: string;
}

const toTime = (value: Date | string | null | undefined) => (value ? (typeof value === "string" ? new Date(value).getTime() : value.getTime()) : NaN);

export function riderGroup(rider: Pick<PickerRider, "online" | "lastSeenAt" | "openJobs">, now: Date = new Date()): 0 | 1 | 2 {
  const seen = toTime(rider.lastSeenAt);
  const out = rider.online && Number.isFinite(seen) && now.getTime() - seen <= RIDER_OUT_WINDOW_MS;
  if (!out) return 2;
  return rider.openJobs > 0 ? 1 : 0;
}

/**
 * The rider picker order for one pickup: free and out first, then out but busy, then offline. Inside each group,
 * riders with a fresh location (under 10 minutes) come first, closest first; then older locations, closest first;
 * then riders with no location. Ties: fewer open jobs, then name.
 */
export function rankRidersForPickup<T extends PickerRider>(riders: T[], pickup: LatLng | null | undefined, now: Date = new Date()): RankedRider<T>[] {
  const ranked = riders.map((rider) => {
    const point = { lat: rider.lat ?? NaN, lng: rider.lng ?? NaN };
    const at = toTime(rider.locationAt);
    const located = isLatLng(point) && Number.isFinite(at);
    const fresh = located && now.getTime() - at <= FRESH_LOCATION_MS;
    const meters = located && isLatLng(pickup) ? haversineMeters(point, pickup) : null;
    const distanceText = meters === null ? "" : `${distanceWords(meters)} · ${etaWords(meters)}`;
    return { rider, group: riderGroup(rider, now), fresh, meters, distanceText };
  });
  const tier = (row: { fresh: boolean; meters: number | null }) => (row.meters === null ? 2 : row.fresh ? 0 : 1);
  return ranked.sort(
    (a, b) =>
      a.group - b.group ||
      tier(a) - tier(b) ||
      (a.meters ?? 0) - (b.meters ?? 0) ||
      a.rider.openJobs - b.rider.openJobs ||
      a.rider.name.localeCompare(b.rider.name),
  );
}

/** Riders app: send a new location when the last one sent is a minute old, or the rider moved 100 m. */
export const REPORT_EVERY_MS = 60_000;
export const REPORT_AFTER_METERS = 100;

export function shouldReportLocation(last: (LatLng & { at: number }) | null, next: LatLng & { at: number }) {
  if (!last) return true;
  if (next.at - last.at >= REPORT_EVERY_MS) return true;
  return haversineMeters(last, next) >= REPORT_AFTER_METERS;
}

/**
 * Known areas with their rough centre. Used to say where a rider is in words ("Ikeja") and as the last-resort
 * pickup location when no geocoder can place an address. Longer names first so "Lekki Phase 1" beats "Lekki".
 */
export const KNOWN_AREAS: ReadonlyArray<{ name: string; lat: number; lng: number; aliases?: string[] }> = [
  // Lagos
  { name: "Victoria Island", lat: 6.4281, lng: 3.4219, aliases: ["v.i", "vi"] },
  { name: "Lekki Phase 1", lat: 6.4478, lng: 3.4723, aliases: ["lekki phase one"] },
  { name: "Ibeju-Lekki", lat: 6.45, lng: 3.85, aliases: ["ibeju lekki"] },
  { name: "Lekki", lat: 6.4474, lng: 3.53 },
  { name: "Ajah", lat: 6.4698, lng: 3.5852 },
  { name: "Sangotedo", lat: 6.47, lng: 3.63 },
  { name: "Ikoyi", lat: 6.452, lng: 3.435 },
  { name: "Lagos Island", lat: 6.4549, lng: 3.394, aliases: ["idumota", "balogun", "marina"] },
  { name: "Ikeja GRA", lat: 6.5833, lng: 3.35 },
  { name: "Ikeja", lat: 6.6018, lng: 3.3515, aliases: ["computer village", "allen avenue", "alausa"] },
  { name: "Yaba", lat: 6.5095, lng: 3.3711 },
  { name: "Ebute Metta", lat: 6.487, lng: 3.38 },
  { name: "Surulere", lat: 6.4999, lng: 3.355 },
  { name: "Maryland", lat: 6.5713, lng: 3.3667 },
  { name: "Ojota", lat: 6.587, lng: 3.382 },
  { name: "Ketu", lat: 6.596, lng: 3.388 },
  { name: "Magodo", lat: 6.62, lng: 3.388 },
  { name: "Ojodu", lat: 6.64, lng: 3.37, aliases: ["berger"] },
  { name: "Ogba", lat: 6.628, lng: 3.342 },
  { name: "Agege", lat: 6.615, lng: 3.32 },
  { name: "Gbagada", lat: 6.5534, lng: 3.388 },
  { name: "Ilupeju", lat: 6.553, lng: 3.357 },
  { name: "Oshodi", lat: 6.555, lng: 3.343 },
  { name: "Isolo", lat: 6.53, lng: 3.32 },
  { name: "Mushin", lat: 6.5273, lng: 3.35 },
  { name: "Apapa", lat: 6.4489, lng: 3.359 },
  { name: "Festac", lat: 6.4667, lng: 3.2833, aliases: ["festac town", "amuwo odofin"] },
  { name: "Ojo", lat: 6.46, lng: 3.18, aliases: ["alaba"] },
  { name: "Egbeda", lat: 6.592, lng: 3.293 },
  { name: "Ikotun", lat: 6.55, lng: 3.27 },
  { name: "Alimosho", lat: 6.6, lng: 3.26 },
  { name: "Ikorodu", lat: 6.6194, lng: 3.5105 },
  { name: "Lagos", lat: 6.5244, lng: 3.3792 },
  // Abuja
  { name: "Maitama", lat: 9.09, lng: 7.495 },
  { name: "Asokoro", lat: 9.04, lng: 7.525 },
  { name: "Wuse", lat: 9.0765, lng: 7.47, aliases: ["wuse 2", "wuse ii"] },
  { name: "Garki", lat: 9.03, lng: 7.49 },
  { name: "Utako", lat: 9.07, lng: 7.44 },
  { name: "Jabi", lat: 9.07, lng: 7.43 },
  { name: "Gwarinpa", lat: 9.11, lng: 7.41 },
  { name: "Kubwa", lat: 9.155, lng: 7.32 },
  { name: "Lugbe", lat: 8.98, lng: 7.37 },
  { name: "Abuja", lat: 9.0765, lng: 7.3986, aliases: ["fct"] },
  // Other cities
  { name: "Port Harcourt", lat: 4.8156, lng: 7.0498, aliases: ["ph", "portharcourt"] },
  { name: "Ibadan", lat: 7.3775, lng: 3.947 },
  { name: "Abeokuta", lat: 7.1475, lng: 3.3619 },
  { name: "Benin City", lat: 6.335, lng: 5.6037, aliases: ["benin"] },
  { name: "Enugu", lat: 6.4584, lng: 7.5464 },
  { name: "Onitsha", lat: 6.145, lng: 6.785 },
  { name: "Aba", lat: 5.1066, lng: 7.3667 },
  { name: "Owerri", lat: 5.485, lng: 7.035 },
  { name: "Kano", lat: 12.0022, lng: 8.592 },
  { name: "Kaduna", lat: 10.5105, lng: 7.4165 },
  { name: "Jos", lat: 9.8965, lng: 8.8583 },
  { name: "Accra", lat: 5.6037, lng: -0.187 },
  { name: "Nairobi", lat: -1.2921, lng: 36.8219 },
];

/** Lowercase words only: "12, Adéola Odeku St." → "12 adeola odeku st". */
export function normalizePlace(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Cache key for an address lookup: the country plus the address as lowercase words. */
export function geocodeCacheKey(address: string, country = "NG") {
  return `${(country || "NG").trim().toLowerCase()}:${normalizePlace(address)}`;
}

/** The area named in an address ("…, Ikeja, Lagos" → Ikeja), most specific first. Null when none is known. */
export function areaFromText(text: string) {
  const words = ` ${normalizePlace(text)} `;
  if (!words.trim()) return null;
  for (const area of KNOWN_AREAS) {
    const names = [area.name, ...(area.aliases ?? [])].map(normalizePlace);
    if (names.some((name) => name && words.includes(` ${name} `))) return area;
  }
  return null;
}

/** The nearest known area within 15 km (within 40 km for a city name), or null. */
export function nearestArea(point: LatLng) {
  let best: { name: string; meters: number } | null = null;
  for (const area of KNOWN_AREAS) {
    const meters = haversineMeters(point, area);
    if (!best || meters < best.meters) best = { name: area.name, meters };
  }
  if (!best) return null;
  return best.meters <= 15_000 || (best.meters <= 40_000 && ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano"].includes(best.name)) ? best.name : null;
}

/** "last seen 2 min ago, Ikeja" for the partner's rider list (no raw coordinates). */
export function riderWhereWords(rider: { lat?: number | null; lng?: number | null; locationAt?: Date | string | null; lastSeenAt?: Date | string | null }, now: Date = new Date()) {
  const point = { lat: rider.lat ?? NaN, lng: rider.lng ?? NaN };
  const area = isLatLng(point) ? nearestArea(point) : null;
  const seen = lastSeenWords(rider.locationAt ?? rider.lastSeenAt ?? null, now);
  return area ? `last seen ${seen}, ${area}` : `last seen ${seen}`;
}

/**
 * The pinned point of a saved delivery address (checkout stores `lat` / `lng` when the buyer picked a suggestion or
 * used their location), or null for a typed-only address.
 */
export function addressPoint(address: unknown): LatLng | null {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const { lat, lng } = address as { lat?: unknown; lng?: unknown };
  const point = { lat: Number(lat), lng: Number(lng) };
  return typeof lat === "number" && typeof lng === "number" && isLatLng(point) ? point : null;
}

/**
 * Google Maps turn-by-turn directions to a place (opens the Maps app on phones). The exact pin when there is one,
 * otherwise the address text, so Maps searches for it.
 */
export function directionsUrl(to: { point?: LatLng | null; address?: string | null }) {
  const destination = to.point && isLatLng(to.point) ? `${to.point.lat.toFixed(6)},${to.point.lng.toFixed(6)}` : (to.address ?? "").trim();
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}`;
}
