// The pickup / depot address a portal form posts with "Find your address" (src/components/geo/AddressAutofill.tsx):
// address, postcode, and the pin in hidden addressLat / addressLng / addressPinFor fields. Pure, unit-tested in
// tests/addresses-maps.test.mjs.
//
// The pin is kept only while the address is still the one it was picked for (addressPinFor): editing the street by
// hand afterwards drops it rather than sending riders to the old spot. Forms without an `address` field change nothing.

import { normalizeNgPostcode } from "../../../shared/ng-postcode.ts";

export interface FormAddressPatch {
  address: string | null;
  postcode: string | null;
  addressLat: number | null;
  addressLng: number | null;
}

type FormLike = { get(name: string): unknown; has(name: string): boolean };

const text = (value: unknown) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");

/** The patch to save, `null` when the form has no address field, or `{ error }` for a postcode that isn't one. */
export function addressFromForm(form: FormLike, opts: { nigeria?: boolean } = {}): FormAddressPatch | null | { error: string } {
  if (!form.has("address")) return null;
  const address = text(form.get("address")).slice(0, 200);
  const rawPostcode = text(form.get("postcode"));
  const postcode = opts.nigeria === false ? rawPostcode.slice(0, 20) : normalizeNgPostcode(rawPostcode);
  if (postcode === null) return { error: "Check the postcode. It looks like LA-11-W06-TC-10, or leave it empty." };

  const lat = Number(text(form.get("addressLat")));
  const lng = Number(text(form.get("addressLng")));
  const pinFor = text(form.get("addressPinFor"));
  const pinned = Boolean(address) && pinFor === address && text(form.get("addressLat")) !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    address: address || null,
    postcode: postcode || null,
    addressLat: pinned ? lat : null,
    addressLng: pinned ? lng : null,
  };
}
