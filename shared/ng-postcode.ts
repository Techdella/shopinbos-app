// Nigeria's digital postcodes (NIPOST National Digital Alphanumeric Postcode System, live 1 October 2026). Pure (no
// imports), shared by the web app and the mobile apps, unit-tested in tests/addresses-maps.test.mjs.
//
// A code is 11 characters, narrowing from state to building: EK-01-A03-FK-01
//   EK   state (ISO 3166-2:NG letters: LA Lagos, FC Abuja, ...)
//   01   LGA, 01 to 99
//   A03  postal district, 3 letters or digits
//   FK   area, 2 letters
//   01   building unit, 01 to 99
// People type it hyphenated, spaced or run together, in any case. Parsing is offline: a well-formed code is not
// necessarily assigned to a building, only the NIPOST API (src/lib/geo/nipost.server.ts) can confirm that.

export interface NgPostcode {
  /** "EK-01-A03-FK-01": what we store and send to NIPOST. */
  canonical: string;
  /** "EK01A03FK01" */
  compact: string;
  /** "EK 01 A03 FK 01": how it is printed on labels. */
  spaced: string;
  state: string;
  stateName: string | null;
  lga: string;
  district: string;
  area: string;
  unit: string;
}

/** The first segment of a postcode is the state's ISO 3166-2:NG code. Names as the checkout's state list writes them. */
export const NG_POSTCODE_STATES: Record<string, string> = {
  AB: "Abia", AD: "Adamawa", AK: "Akwa Ibom", AN: "Anambra", BA: "Bauchi", BY: "Bayelsa", BE: "Benue", BO: "Borno",
  CR: "Cross River", DE: "Delta", EB: "Ebonyi", ED: "Edo", EK: "Ekiti", EN: "Enugu", FC: "Abuja FCT", GO: "Gombe",
  IM: "Imo", JI: "Jigawa", KD: "Kaduna", KN: "Kano", KT: "Katsina", KE: "Kebbi", KO: "Kogi", KW: "Kwara",
  LA: "Lagos", NA: "Nasarawa", NI: "Niger", OG: "Ogun", ON: "Ondo", OS: "Osun", OY: "Oyo", PL: "Plateau",
  RI: "Rivers", SO: "Sokoto", TA: "Taraba", YO: "Yobe", ZA: "Zamfara",
};

const COMPACT = /^([A-Z]{2})(0[1-9]|[1-9][0-9])([A-Z0-9]{3})([A-Z]{2})(0[1-9]|[1-9][0-9])$/;
// The same shape inside free text ("12 Allen Avenue, Ikeja, LA-11-W06-TC-10"), separators optional.
const IN_TEXT = /(?:^|[^A-Za-z0-9])([A-Za-z]{2})[\s-]*(0[1-9]|[1-9][0-9])[\s-]*([A-Za-z0-9]{3})[\s-]*([A-Za-z]{2})[\s-]*(0[1-9]|[1-9][0-9])(?![A-Za-z0-9])/;

function build(parts: string[]): NgPostcode | null {
  const [state, lga, district, area, unit] = parts.map((part) => part.toUpperCase());
  const stateName = NG_POSTCODE_STATES[state] ?? null;
  // A state prefix NIPOST doesn't use is a typo, not a code.
  if (!stateName) return null;
  return {
    canonical: `${state}-${lga}-${district}-${area}-${unit}`,
    compact: `${state}${lga}${district}${area}${unit}`,
    spaced: `${state} ${lga} ${district} ${area} ${unit}`,
    state,
    stateName,
    lga,
    district,
    area,
    unit,
  };
}

/** A postcode typed any way ("ek 01 a03 fk01"), or null when it isn't one. */
export function parseNgPostcode(input: string | null | undefined): NgPostcode | null {
  const compact = String(input ?? "").toUpperCase().replace(/[\s-]+/g, "");
  if (compact.length !== 11) return null;
  const match = COMPACT.exec(compact);
  return match ? build(match.slice(1)) : null;
}

/** The first postcode written somewhere in an address, or null. */
export function findNgPostcode(text: string | null | undefined): NgPostcode | null {
  const match = IN_TEXT.exec(String(text ?? "").slice(0, 500));
  return match ? build(match.slice(1)) : null;
}

/** The old six-digit postcodes (100001 Lagos, 900001 Abuja) people still write. */
export function isLegacyNgPostcode(input: string | null | undefined) {
  return /^\d{6}$/.test(String(input ?? "").trim());
}

/**
 * What to store for a postcode the buyer typed: the canonical form of a new code, a legacy six-digit code as typed,
 * "" for nothing, and null for something that is neither (the field then shows an error).
 */
export function normalizeNgPostcode(input: string | null | undefined): string | null {
  const value = String(input ?? "").trim();
  if (!value) return "";
  const code = parseNgPostcode(value);
  if (code) return code.canonical;
  return isLegacyNgPostcode(value) ? value : null;
}

/**
 * True while what's typed could still become a postcode ("LA", "LA-11-W"), so the field can wait before showing an
 * error.
 */
export function couldBeNgPostcode(input: string | null | undefined) {
  const compact = String(input ?? "").toUpperCase().replace(/[\s-]+/g, "");
  if (!compact || compact.length > 11) return false;
  const shape = "AA99XXXAA99";
  for (let i = 0; i < compact.length; i += 1) {
    const char = compact[i];
    const want = shape[i];
    if (want === "A" && !/[A-Z]/.test(char)) return false;
    if (want === "9" && !/[0-9]/.test(char)) return false;
    if (want === "X" && !/[A-Z0-9]/.test(char)) return false;
  }
  return compact.length < 2 || Boolean(NG_POSTCODE_STATES[compact.slice(0, 2)]);
}

/**
 * The entry of a state list ("Abuja FCT", "Lagos") a geocoder's state name means ("Federal Capital Territory",
 * "Lagos State", "Abuja"), or "" when none does.
 */
export function matchRegion(name: string | null | undefined, regions: readonly string[]) {
  const words = (value: string) => value.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\b(state|region)\b/g, " ").replace(/\s+/g, " ").trim();
  let wanted = words(String(name ?? ""));
  if (!wanted) return "";
  if (wanted === "federal capital territory" || wanted === "fct" || wanted === "abuja") wanted = "abuja fct";
  return regions.find((region) => words(region) === wanted) ?? regions.find((region) => words(region).includes(wanted) || wanted.includes(words(region))) ?? "";
}
