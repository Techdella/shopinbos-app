// What a shopper's browser remembers between the bag and checkout: their details (only when they agree to
// save them on this device) and a discount code applied in the bag.

import { sanitizeSavedDetails, type CheckoutDetails } from "@shared/cart-checkout";
import { westAfricaCountries } from "@/lib/data/west-africa";
import type { GeoAddress } from "@/lib/geo/types";
import { matchRegion } from "@shared/ng-postcode";

const detailsKey = (slug: string) => `checkout-details:${slug}`;
const discountKey = (slug: string) => `checkout-discount:${slug}`;

export function readSavedDetails(slug: string): Partial<CheckoutDetails> {
  try {
    const raw = localStorage.getItem(detailsKey(slug));
    return raw ? sanitizeSavedDetails(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function saveDetails(slug: string, details: Partial<CheckoutDetails>) {
  try {
    localStorage.setItem(detailsKey(slug), JSON.stringify(sanitizeSavedDetails({ ...readSavedDetails(slug), ...details })));
  } catch {}
}

export function forgetDetails(slug: string) {
  try {
    localStorage.removeItem(detailsKey(slug));
  } catch {}
}

export function readBagDiscount(slug: string) {
  try {
    return sessionStorage.getItem(discountKey(slug)) ?? "";
  } catch {
    return "";
  }
}

export function rememberBagDiscount(slug: string, code: string | null) {
  try {
    if (code) sessionStorage.setItem(discountKey(slug), code);
    else sessionStorage.removeItem(discountKey(slug));
  } catch {}
}

/** States or regions for a country name or code (Nigeria's 36 states and the FCT, Ghana's regions…); [] when unknown. */
export function regionsFor(country: string | null | undefined) {
  const wanted = (country || "Nigeria").trim().toLowerCase();
  const match = westAfricaCountries.find((entry) => entry.name.toLowerCase() === wanted || entry.code.toLowerCase() === wanted);
  return match?.regions ?? [];
}

export function countryName(country: string | null | undefined) {
  const wanted = (country || "Nigeria").trim().toLowerCase();
  return westAfricaCountries.find((entry) => entry.name.toLowerCase() === wanted || entry.code.toLowerCase() === wanted)?.name ?? (country || "Nigeria");
}

export const COUNTRY_NAMES = westAfricaCountries.map((entry) => entry.name);

export interface AppliedCode {
  code: string;
  type: string;
  value: number;
}

/** Checks a discount or coupon code with the store (same rules the checkout API applies). */
export async function checkDiscountCode(storeId: string, code: string, subtotal: number): Promise<{ applied: AppliedCode } | { error: string }> {
  try {
    const res = await fetch("/api/store/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim().toUpperCase(), storeId, subtotal }),
    });
    const data = await res.json().catch(() => null);
    if (data?.valid) return { applied: { code: String(data.code), type: String(data.type), value: Number(data.value) } };
    return { error: typeof data?.error === "string" ? data.error : data?.error?.message ?? "That code isn't valid." };
  } catch {
    return { error: "Couldn't check the code. Check your connection and try again." };
  }
}

const prefillKey = (slug: string) => `checkout-prefill:${slug}`;

/** Contact details from a cart reminder link, used once to fill checkout (kept for this tab only). */
export function rememberPrefill(slug: string, contact: Partial<CheckoutDetails>) {
  try {
    sessionStorage.setItem(prefillKey(slug), JSON.stringify(sanitizeSavedDetails(contact)));
  } catch {}
}

export function readPrefill(slug: string): Partial<CheckoutDetails> {
  try {
    const raw = sessionStorage.getItem(prefillKey(slug));
    return raw ? sanitizeSavedDetails(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/**
 * The buyer's details with a looked-up address applied (a picked suggestion, "use my location" or a postcode):
 * fills what it knows, keeps the rest, and picks the state from the country's list.
 */
export function withGeoAddress(prev: CheckoutDetails, address: GeoAddress): CheckoutDetails {
  const country = address.country ? countryName(address.country) : prev.country;
  const regions = regionsFor(country);
  const state = matchRegion(address.state, regions) || (regions.length ? prev.state : address.state || prev.state);
  return {
    ...prev,
    street: address.street || prev.street,
    city: address.city || prev.city,
    state,
    country,
    postcode: address.postcode?.postcode ?? prev.postcode,
    lat: address.lat ?? prev.lat ?? null,
    lng: address.lng ?? prev.lng ?? null,
  };
}
