import "server-only";
import { nearestArea, type LatLng } from "@shared/delivery-geo";
import { parseNgPostcode, type NgPostcode } from "@shared/ng-postcode";
import { addressAt, googleMapsConfigured, placeAddress, type StructuredAddress } from "./google-maps.server";
import { lookupPostcode, nipostConfigured, postcodeAt } from "./nipost.server";
import type { GeoAddress, GeoPostcode, GeoStatus } from "./types";

// Address entry for checkout, stores, suppliers and delivery jobs: Google places the address, NIPOST gives the
// building's digital postcode (and checks one that was typed). Either can be missing; the answer says what's known.

export function geoStatus(): GeoStatus {
  return { maps: googleMapsConfigured(), nipost: nipostConfigured() };
}

/** A postcode checked offline, then with NIPOST when it's configured. */
export async function checkPostcode(input: string | NgPostcode): Promise<(GeoPostcode & { point: LatLng | null }) | null> {
  const code = typeof input === "string" ? parseNgPostcode(input) : input;
  if (!code) return null;
  const record = await lookupPostcode(code);
  return {
    postcode: code.canonical,
    spaced: code.spaced,
    stateName: record?.stateName ?? code.stateName,
    assigned: record ? record.valid : null,
    verified: record?.verified ?? false,
    lgaName: record?.lgaName ?? null,
    locality: record?.locality ?? null,
    point: record?.point ?? null,
  };
}

async function postcodeForPoint(point: LatLng | null): Promise<GeoPostcode | null> {
  if (!point) return null;
  const found = await postcodeAt(point);
  const code = found ? parseNgPostcode(found.postcode) : null;
  if (!code) return null;
  return { postcode: code.canonical, spaced: code.spaced, stateName: code.stateName, assigned: true, verified: false, lgaName: null, locality: null };
}

function fromStructured(address: StructuredAddress, postcode: GeoPostcode | null): GeoAddress {
  return {
    formatted: address.formatted,
    street: address.street,
    city: address.city,
    state: address.state || postcode?.stateName || "",
    country: address.country,
    countryCode: address.countryCode,
    lat: address.point?.lat ?? null,
    lng: address.point?.lng ?? null,
    postcode,
    source: "google",
  };
}

/** A picked suggestion: its address parts, pin and (in Nigeria) digital postcode. */
export async function resolvePlace(placeId: string, sessionToken?: string | null): Promise<GeoAddress | null> {
  const address = await placeAddress(placeId, sessionToken);
  if (!address) return null;
  const nigeria = !address.countryCode || address.countryCode.toUpperCase() === "NG";
  return fromStructured(address, nigeria ? await postcodeForPoint(address.point) : null);
}

/** "Use my location": the address and postcode at a point. Without Google, the nearest area we know by name. */
export async function resolvePoint(point: LatLng): Promise<GeoAddress | null> {
  const [address, postcode] = await Promise.all([addressAt(point), postcodeForPoint(point)]);
  if (address) return fromStructured({ ...address, point }, postcode);
  const area = nearestArea(point);
  if (!area && !postcode) return null;
  return {
    formatted: [area, postcode?.stateName].filter(Boolean).join(", "),
    street: "",
    city: area ?? postcode?.locality ?? "",
    state: postcode?.stateName ?? "",
    country: "Nigeria",
    countryCode: "NG",
    lat: point.lat,
    lng: point.lng,
    postcode,
    source: postcode ? "nipost" : "area",
  };
}

/** A typed postcode as an address: its state and area from NIPOST, and the street at its pin when Google knows it. */
export async function resolvePostcode(input: string): Promise<GeoAddress | null> {
  const checked = await checkPostcode(input);
  if (!checked) return null;
  const { point, ...postcode } = checked;
  const address = point ? await addressAt(point) : null;
  if (address) return fromStructured({ ...address, point }, postcode);
  return {
    formatted: [postcode.locality, postcode.lgaName, postcode.stateName].filter(Boolean).join(", "),
    street: "",
    city: postcode.locality ?? postcode.lgaName ?? "",
    state: postcode.stateName ?? "",
    country: "Nigeria",
    countryCode: "NG",
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    postcode,
    source: "nipost",
  };
}
