"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { FIELD_HELP, FIELD_INPUT, FIELD_LABEL } from "@/components/seller-settings/fields";
import type { GeoAddress } from "@/lib/geo/types";
import { mapImageUrl, useAddressSuggestions, useGeoStatus, useMyLocation } from "./useAddressLookup";

// "Find your address" for the portals' plain (server-rendered) address forms: a search box with Google suggestions
// and "use my location" that fill the form's own inputs (found by id) with the street, area, state, country and
// NIPOST postcode. The form still posts its own fields, so nothing changes for it when Maps isn't configured (the
// box then only offers "use my location" if NIPOST can answer, or hides itself).
// Only for uncontrolled inputs: a React-controlled field would overwrite what this writes.

export interface AutofillTargets {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  /** Hidden inputs that receive the pin, when the form keeps one. */
  lat?: string;
  lng?: string;
}

function write(id: string | undefined, value: string | number | null | undefined) {
  if (!id || value === null || value === undefined || value === "") return;
  const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!input) return;
  if (input instanceof HTMLSelectElement) {
    const wanted = String(value).toLowerCase();
    const option = Array.from(input.options).find((entry) => entry.value.toLowerCase() === wanted || entry.text.toLowerCase() === wanted);
    if (!option) return;
    input.value = option.value;
  } else {
    input.value = String(value);
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function AddressAutofill({ targets, label = "Find your address", country = "Nigeria" }: { targets: AutofillTargets; label?: string; country?: string }) {
  const status = useGeoStatus();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const { suggestions, loading, pick, close } = useAddressSuggestions(query, { country, enabled: status.maps });
  const { locate, busy, supported } = useMyLocation();

  if (!status.maps && !status.nipost) return null;

  function fill(address: GeoAddress) {
    write(targets.street, address.street);
    write(targets.city, address.city);
    write(targets.state, address.state);
    write(targets.country, address.country);
    write(targets.postcode, address.postcode?.postcode);
    write(targets.lat, address.lat);
    write(targets.lng, address.lng);
    setPin(address.lat !== null && address.lng !== null ? { lat: address.lat, lng: address.lng } : null);
    setNote(address.postcode ? `Postcode ${address.postcode.spaced} added.` : "Address added. Check it below and save.");
  }

  return (
    <div className="rounded-[18px] bg-app-canvas p-4">
      {status.maps ? (
        <>
          <label htmlFor="address-autofill" className={FIELD_LABEL}>{label}</label>
          <input
            id="address-autofill"
            className={FIELD_INPUT}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => window.setTimeout(close, 150)}
            placeholder="Start typing the street or building"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls="address-autofill-options"
          />
          {suggestions.length > 0 ? (
            <ul id="address-autofill-options" role="listbox" className="m-0 mt-1.5 list-none rounded-[16px] border border-app-line bg-white p-1">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.placeId}
                  role="option"
                  aria-selected={false}
                  className="cursor-pointer rounded-[12px] px-3 py-2.5 text-[14.5px] hover:bg-app-canvas"
                  onMouseDown={async (event) => {
                    event.preventDefault();
                    const { data, error } = await pick(suggestion);
                    if (data) {
                      fill(data);
                      setQuery("");
                    } else setNote(error ?? "");
                  }}
                >
                  <span className="font-bold text-app-ink">{suggestion.main}</span>
                  {suggestion.secondary ? <span className="block text-[12.5px] text-app-ink-soft">{suggestion.secondary}</span> : null}
                </li>
              ))}
              <li aria-hidden className="px-3 pb-1 pt-1.5 text-right text-[10.5px] text-app-ink-soft">Powered by Google</li>
            </ul>
          ) : null}
        </>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {supported ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setNote("");
              const { data, error } = await locate();
              if (data) fill(data);
              else setNote(error ?? "");
            }}
            className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-app-ink underline-offset-2 hover:underline disabled:opacity-60"
          >
            <Icon name="pin" size={15} /> {busy ? "Finding you…" : "Use my current location"}
          </button>
        ) : null}
        {loading ? <span className="text-[12.5px] text-app-ink-soft">Looking up addresses…</span> : null}
      </div>
      {note ? <p role="status" className={FIELD_HELP}>{note}</p> : null}
      {pin && status.maps ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mapImageUrl(pin, { w: 600, h: 200 })} alt="Map showing the address you picked" width={600} height={200} loading="lazy" className="mt-3 h-[140px] w-full rounded-[14px] border border-app-line object-cover" />
      ) : null}
    </div>
  );
}
