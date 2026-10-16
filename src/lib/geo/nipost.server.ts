import "server-only";
import { db } from "@/lib/db/client";
import { isLatLng, type LatLng } from "@shared/delivery-geo";
import { parseNgPostcode, type NgPostcode } from "@shared/ng-postcode";

// NIPOST's postcode API (api.postcode.gov.ng, docs.postcode.gov.ng): confirms a digital postcode is assigned to a
// building, places it, and finds the postcode at a point. Keys come from dashboard.postcode.gov.ng after KYB
// (staging keys first, production after NIPOST's UAT). Without NIPOST_API_KEY everything here answers null and
// postcodes are only checked offline (shared/ng-postcode.ts).
//
//   GET /v1/lookup?code=EK-01-A03-FK-01&level=1   → { data: { postcode, valid, status, verified, administrative_address?, point_geometry? } }
//   GET /v1/search/reverse?lat=&lng=&max_distance_m=  → { data: { found, unit?: { postcode, display, distance_m, confidence } } }
//   errors → { error: { code, message } } (401 invalid_api_key, 403 level_not_granted, 400 bad_request)
//
// Lookup levels are cumulative (1 = valid or not ... 5 = everything) and capped at what the key was granted, so
// NIPOST_LOOKUP_LEVEL must not be above it. Answers are cached in GeocodeCache (lookups are billed per call).
// The key travels only in X-API-Key, redirects are refused (they would carry it elsewhere), and failures never throw.

const DEFAULT_BASE = "https://api.postcode.gov.ng";
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PostcodeLookup {
  postcode: string;
  /** Assigned to a building in NIPOST's register. */
  valid: boolean;
  status: "valid" | "not_found" | "invalid" | string;
  /** NIPOST has confirmed the building on the ground (most codes are not yet). */
  verified: boolean;
  stateName: string | null;
  lgaName: string | null;
  locality: string | null;
  point: LatLng | null;
}

export interface PostcodeAtPoint {
  postcode: string;
  distanceM: number | null;
  confidence: string | null;
}

export function nipostConfigured() {
  return Boolean(process.env.NIPOST_API_KEY?.trim());
}

function baseUrl() {
  const value = process.env.NIPOST_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) return DEFAULT_BASE;
  // Plain http would send the key unencrypted; only local stubs in tests may use it.
  return /^https:\/\//.test(value) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value) ? value : DEFAULT_BASE;
}

function lookupLevel() {
  const level = Number(process.env.NIPOST_LOOKUP_LEVEL);
  return Number.isInteger(level) && level >= 1 && level <= 5 ? level : 1;
}

type Envelope = { data?: unknown; error?: { code?: string; message?: string } | string };

async function call(path: string, query: Record<string, string>): Promise<Record<string, unknown> | unknown[] | null> {
  const key = process.env.NIPOST_API_KEY?.trim();
  if (!key) return null;
  const url = `${baseUrl()}${path}?${new URLSearchParams(query).toString()}`;
  try {
    const response = await fetch(url, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 1_000_000) return null;
    const json = (await response.json().catch(() => null)) as Envelope | null;
    if (!json || json.error || !response.ok) {
      const error = typeof json?.error === "string" ? json.error : json?.error?.code;
      console.warn(`[nipost] ${path} answered ${response.status}${error ? ` (${error})` : ""}`);
      return null;
    }
    return json.data && typeof json.data === "object" ? (json.data as Record<string, unknown> | unknown[]) : null;
  } catch (error) {
    console.warn(`[nipost] ${path} failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** GeoJSON Point ({ coordinates: [lng, lat] }), a bare [lng, lat] pair, or { lat, lng }. */
function readPoint(value: unknown): LatLng | null {
  if (!value || typeof value !== "object") return null;
  const pair = Array.isArray(value) ? value : (value as { coordinates?: unknown }).coordinates;
  if (Array.isArray(pair) && pair.length >= 2) {
    const point = { lat: Number(pair[1]), lng: Number(pair[0]) };
    return isLatLng(point) ? point : null;
  }
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  const point = { lat: Number(lat), lng: Number(lng) };
  return isLatLng(point) ? point : null;
}

function cacheFresh(row: { lat: number | null; updatedAt: Date } | null) {
  if (!row) return false;
  return Date.now() - row.updatedAt.getTime() < (row.lat === null ? MISS_TTL_MS : HIT_TTL_MS);
}

/** NIPOST's record for a postcode, or null when it can't be asked (no key, malformed code, API trouble). */
export async function lookupPostcode(input: string | NgPostcode): Promise<PostcodeLookup | null> {
  const code = typeof input === "string" ? parseNgPostcode(input) : input;
  if (!code || !nipostConfigured()) return null;
  const cacheKey = `nipost:${code.canonical}`;

  const cached = await db.geocodeCache.findUnique({ where: { key: cacheKey } }).catch(() => null);
  if (cached && cacheFresh(cached) && cached.label) {
    try {
      const saved = JSON.parse(cached.label) as Omit<PostcodeLookup, "point">;
      return { ...saved, point: cached.lat !== null && cached.lng !== null ? { lat: cached.lat, lng: cached.lng } : null };
    } catch {
      // An unreadable row is looked up again.
    }
  }

  const data = await call("/v1/lookup", { code: code.canonical, level: String(lookupLevel()) });
  if (!data || Array.isArray(data) || typeof data.valid !== "boolean") return null;
  const admin = (data.administrative_address && typeof data.administrative_address === "object" ? data.administrative_address : {}) as Record<string, unknown>;
  const result: PostcodeLookup = {
    postcode: text(data.postcode) ?? code.canonical,
    valid: data.valid,
    status: text(data.status) ?? (data.valid ? "valid" : "not_found"),
    verified: data.verified === true,
    stateName: text(admin.state_name) ?? code.stateName,
    lgaName: text(admin.lga_name),
    locality: text(admin.locality_name),
    point: readPoint(data.point_geometry),
  };
  const { point, ...saved } = result;
  const label = JSON.stringify(saved).slice(0, 300);
  await db.geocodeCache
    .upsert({
      where: { key: cacheKey },
      create: { key: cacheKey, query: code.canonical, lat: point?.lat ?? null, lng: point?.lng ?? null, source: "nipost", label },
      update: { lat: point?.lat ?? null, lng: point?.lng ?? null, source: "nipost", label },
    })
    .catch(() => null);
  return result;
}

/** The postcode of the building nearest a point (within `maxDistanceM`, NIPOST caps it at 250 m), or null. */
export async function postcodeAt(point: LatLng, maxDistanceM = 40): Promise<PostcodeAtPoint | null> {
  if (!isLatLng(point) || !nipostConfigured()) return null;
  // ~11 m grid: one paid lookup per doorstep, however often the pin is dropped there.
  const cacheKey = `nipost-at:${point.lat.toFixed(4)},${point.lng.toFixed(4)}:${Math.round(maxDistanceM)}`;
  const cached = await db.geocodeCache.findUnique({ where: { key: cacheKey } }).catch(() => null);
  if (cached && cacheFresh(cached)) {
    if (!cached.label) return null;
    try {
      return JSON.parse(cached.label) as PostcodeAtPoint;
    } catch {
      // Looked up again below.
    }
  }

  const data = await call("/v1/search/reverse", { lat: String(point.lat), lng: String(point.lng), max_distance_m: String(Math.max(1, Math.min(250, maxDistanceM))) });
  if (!data || Array.isArray(data)) return null;
  const unit = (data.unit && typeof data.unit === "object" ? data.unit : {}) as Record<string, unknown>;
  const code = data.found === true ? parseNgPostcode(text(unit.postcode)) : null;
  const result: PostcodeAtPoint | null = code
    ? { postcode: code.canonical, distanceM: typeof unit.distance_m === "number" ? unit.distance_m : null, confidence: text(unit.confidence) }
    : null;
  await db.geocodeCache
    .upsert({
      where: { key: cacheKey },
      create: { key: cacheKey, query: `${point.lat},${point.lng}`, lat: result ? point.lat : null, lng: result ? point.lng : null, source: "nipost", label: result ? JSON.stringify(result) : null },
      update: { lat: result ? point.lat : null, lng: result ? point.lng : null, source: "nipost", label: result ? JSON.stringify(result) : null },
    })
    .catch(() => null);
  return result;
}
