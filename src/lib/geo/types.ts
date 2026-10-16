// What /api/public/geo/* answers, shared by the routes and the address fields (src/components/geo).

export interface GeoPostcode {
  /** "LA-11-W06-TC-10" */
  postcode: string;
  /** "LA 11 W06 TC 10", for display and labels. */
  spaced: string;
  stateName: string | null;
  /** From NIPOST: assigned to a building. Null when NIPOST wasn't asked (no key, or it didn't answer). */
  assigned: boolean | null;
  /** From NIPOST: confirmed on the ground. */
  verified: boolean;
  lgaName: string | null;
  locality: string | null;
}

export interface GeoAddress {
  formatted: string;
  street: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  lat: number | null;
  lng: number | null;
  /** The building's digital postcode (NIPOST), when one is known for this pin. */
  postcode: GeoPostcode | null;
  source: "google" | "nipost" | "area";
}

export interface GeoSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

export interface GeoStatus {
  /** Google address suggestions and map previews are switched on (GOOGLE_MAPS_API_KEY). */
  maps: boolean;
  /** NIPOST postcode checks are switched on (NIPOST_API_KEY). Offline format checks always run. */
  nipost: boolean;
}
