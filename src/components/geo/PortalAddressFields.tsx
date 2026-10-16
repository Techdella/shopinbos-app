import { AddressAutofill } from "./AddressAutofill";

// The pickup / depot address block for the supplier and logistics profile forms: "Find your address", the street
// and postcode fields, and the pin in hidden fields (read back by src/lib/geo/form-address.ts).

export function PortalAddressFields({
  address,
  postcode,
  lat,
  lng,
  labels,
  inputClass,
  labelClass,
  hintClass,
}: {
  address: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  labels: { street: string; postcode: string; postcodeHelp: string };
  inputClass: string;
  labelClass: string;
  hintClass?: string;
}) {
  const pinned = lat !== null && lng !== null;
  return (
    <div className="grid gap-4">
      <AddressAutofill targets={{ street: "address", country: "country", postcode: "postcode", lat: "addressLat", lng: "addressLng", pinFor: "addressPinFor" }} />
      <div>
        <label htmlFor="address" className={labelClass}>{labels.street}</label>
        <input id="address" name="address" className={inputClass} defaultValue={address ?? ""} placeholder="12 Allen Avenue, Ikeja" autoComplete="street-address" maxLength={200} />
      </div>
      <div>
        <label htmlFor="postcode" className={labelClass}>{labels.postcode}</label>
        <input id="postcode" name="postcode" className={inputClass} defaultValue={postcode ?? ""} placeholder="LA-11-W06-TC-10" autoComplete="postal-code" autoCapitalize="characters" spellCheck={false} maxLength={20} />
        <p className={hintClass ?? "mt-1.5 text-[12.5px] text-app-ink-soft"}>{labels.postcodeHelp}</p>
      </div>
      <input type="hidden" id="addressLat" name="addressLat" defaultValue={pinned ? String(lat) : ""} />
      <input type="hidden" id="addressLng" name="addressLng" defaultValue={pinned ? String(lng) : ""} />
      <input type="hidden" id="addressPinFor" name="addressPinFor" defaultValue={pinned ? (address ?? "") : ""} />
    </div>
  );
}
