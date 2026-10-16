import "server-only";
import { isLatLng, type LatLng } from "@shared/delivery-geo";

// Google Maps Platform for address entry, called from our own routes (src/app/api/geo/*) so the key never reaches
// a browser and the CSP stays as it is. One key, GOOGLE_MAPS_API_KEY (also used by src/lib/logistics/geocode.ts),
// with these APIs enabled on it: Places API (New), Geocoding API and Maps Static API. Restrict it to those APIs.
//
//   suggestAddresses  Places Autocomplete (New), as the buyer types. A session token ties a run of keystrokes and the
//                     one details call that ends it into a single billed session.
//   placeAddress      Place Details (New): the picked suggestion as street / area / state / country + its pin.
//   addressAt         Geocoding API reverse lookup: "use my location" → an address.
//   staticMapImage    Maps Static API PNG of a pin, streamed through /api/geo/map.
//
// Without the key every function answers null / [] and the forms stay plain text fields. Never throws.
// GOOGLE_PLACES_BASE_URL / GOOGLE_GEOCODE_BASE_URL / GOOGLE_STATIC_MAPS_BASE_URL point at local stubs in tests.

export interface AddressSuggestion {
  placeId: string;
  /** "12 Allen Avenue" */
  main: string;
  /** "Ikeja, Lagos, Nigeria" */
  secondary: string;
}

export interface StructuredAddress {
  formatted: string;
  street: string;
  /** Neighbourhood / area or city, what the checkout calls "Area or city" (zones match on it). */
  city: string;
  state: string;
  country: string;
  countryCode: string;
  postalCode: string;
  point: LatLng | null;
}

type Component = { long: string; short: string; types: string[] };

export function googleMapsConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
}

function key() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function base(envName: string, fallback: string) {
  const value = process.env[envName]?.trim();
  return (value && /^https?:\/\//.test(value) ? value : fallback).replace(/\/+$/, "");
}

function cleanSession(token: string | null | undefined) {
  return token && /^[A-Za-z0-9_-]{8,64}$/.test(token) ? token : undefined;
}

/** Address parts from Google's components, the way Nigerian addresses are written. */
export function structure(formatted: string, components: Component[], point: LatLng | null): StructuredAddress {
  const pick = (...types: string[]) => {
    for (const type of types) {
      const hit = components.find((component) => component.types.includes(type));
      if (hit?.long) return hit;
    }
    return null;
  };
  const number = pick("street_number")?.long ?? "";
  const route = pick("route")?.long ?? "";
  const premise = pick("premise", "establishment", "point_of_interest")?.long ?? "";
  const country = pick("country");
  const street = [number, route].filter(Boolean).join(" ") || premise || formatted.split(",")[0]?.trim() || "";
  return {
    formatted,
    street,
    city: pick("sublocality_level_1", "sublocality", "neighborhood", "locality", "administrative_area_level_2")?.long ?? "",
    state: pick("administrative_area_level_1")?.long ?? "",
    country: country?.long ?? "",
    countryCode: country?.short ?? "",
    postalCode: pick("postal_code")?.long ?? "",
    point,
  };
}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000) });
    const json = (await response.json().catch(() => null)) as T | null;
    if (!response.ok) {
      const message = (json as { error?: { status?: string; message?: string } } | null)?.error?.status ?? response.status;
      console.warn(`[google-maps] ${new URL(url).pathname} answered ${message}`);
      return null;
    }
    return json;
  } catch (error) {
    console.warn(`[google-maps] request failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** Up to 5 addresses matching what's typed, in that country, nearest `near` first when given. */
export async function suggestAddresses(input: string, opts: { countryCode?: string; sessionToken?: string | null; near?: LatLng | null } = {}): Promise<AddressSuggestion[]> {
  const query = input.trim().slice(0, 200);
  if (!googleMapsConfigured() || query.length < 3) return [];
  const cc = (opts.countryCode || "ng").toLowerCase();
  const body: Record<string, unknown> = { input: query, includedRegionCodes: [cc], regionCode: cc, languageCode: "en" };
  const session = cleanSession(opts.sessionToken);
  if (session) body.sessionToken = session;
  if (opts.near && isLatLng(opts.near)) body.locationBias = { circle: { center: { latitude: opts.near.lat, longitude: opts.near.lng }, radius: 30_000 } };

  const json = await getJson<{ suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }> }>(
    `${base("GOOGLE_PLACES_BASE_URL", "https://places.googleapis.com")}/v1/places:autocomplete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat" },
      body: JSON.stringify(body),
    },
  );
  return (json?.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId))
    .slice(0, 5)
    .map((prediction) => ({
      placeId: prediction.placeId as string,
      main: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
      secondary: prediction.structuredFormat?.secondaryText?.text ?? "",
    }));
}

/** The picked suggestion as address parts and a pin. */
export async function placeAddress(placeId: string, sessionToken?: string | null): Promise<StructuredAddress | null> {
  if (!googleMapsConfigured() || !/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
  const params = new URLSearchParams({ languageCode: "en" });
  const session = cleanSession(sessionToken);
  if (session) params.set("sessionToken", session);
  const json = await getJson<{ formattedAddress?: string; location?: { latitude?: number; longitude?: number }; addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }> }>(
    `${base("GOOGLE_PLACES_BASE_URL", "https://places.googleapis.com")}/v1/places/${encodeURIComponent(placeId)}?${params}`,
    { headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "formattedAddress,location,addressComponents" } },
  );
  if (!json) return null;
  const point = { lat: Number(json.location?.latitude), lng: Number(json.location?.longitude) };
  const components = (json.addressComponents ?? []).map((component) => ({ long: component.longText ?? "", short: component.shortText ?? "", types: component.types ?? [] }));
  return structure(json.formattedAddress ?? "", components, isLatLng(point) ? point : null);
}

/** The street address at a point ("use my location"), or null. */
export async function addressAt(point: LatLng): Promise<StructuredAddress | null> {
  if (!googleMapsConfigured() || !isLatLng(point)) return null;
  const url = `${base("GOOGLE_GEOCODE_BASE_URL", "https://maps.googleapis.com/maps/api/geocode")}/json?latlng=${point.lat},${point.lng}&language=en&result_type=street_address|premise|route|neighborhood|sublocality&key=${encodeURIComponent(key())}`;
  const json = await getJson<{ status?: string; results?: Array<{ formatted_address?: string; address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }> }> }>(url);
  const hit = json?.status === "OK" ? json.results?.[0] : undefined;
  if (!hit) return null;
  const components = (hit.address_components ?? []).map((component) => ({ long: component.long_name ?? "", short: component.short_name ?? "", types: component.types ?? [] }));
  return structure(hit.formatted_address ?? "", components, point);
}

/** A PNG map with a pin, for the address preview. Null without a key or when Google refuses. */
export async function staticMapImage(point: LatLng, opts: { width?: number; height?: number; zoom?: number } = {}) {
  if (!googleMapsConfigured() || !isLatLng(point)) return null;
  const width = Math.max(120, Math.min(640, Math.round(opts.width ?? 600)));
  const height = Math.max(80, Math.min(640, Math.round(opts.height ?? 240)));
  const zoom = Math.max(10, Math.min(19, Math.round(opts.zoom ?? 16)));
  const at = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
  const params = new URLSearchParams({ center: at, zoom: String(zoom), size: `${width}x${height}`, scale: "2", markers: `color:0x0E2A38|${at}`, key: key() });
  try {
    const response = await fetch(`${base("GOOGLE_STATIC_MAPS_BASE_URL", "https://maps.googleapis.com/maps/api/staticmap")}?${params}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;
    return { body: await response.arrayBuffer(), contentType: type };
  } catch {
    return null;
  }
}
