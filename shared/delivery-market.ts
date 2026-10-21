// Logistics marketplace rules (docs: the "Shopinbos Logistics Marketplace" spec): where partners go, structured rate
// cards, size bands, the delivery options a customer sees at checkout, the one status list every partner uses, the
// seller's exceptions, partner stats and ranking, and the gentle chat warnings about taking jobs off the app.
// Shared by the web app, the server and the mobile app. Pure (its only import is the LGA list in ./ng-lgas.ts),
// unit-tested in tests/delivery-market.test.mjs.
//
// Decisions taken for v1 (spec §11), each in one place here so they're easy to change:
//   1. Connecting is instant on a partner's public rates (CONNECT_NEEDS_APPROVAL); private rates need the shop to accept.
//   2. Dropship: the supplier's own connected partners ship from the supplier's place (DROPSHIP_SHIPPER).
//   3. Size band of a parcel: the bigger of the largest item's band and the band of the summed weight (parcelBand).
//   4. Partner payout: the delivery fee is split to the partner when the customer pays (PAYOUT_TIMING).
//   5. Partner name at checkout: the seller's choice per partner (DeliveryConnection.showPartnerName).
//   6. Shopinbos commission on delivery fees: none (DELIVERY_COMMISSION_RATE).
//   7. Coverage: states, regions and nationwide, with optional "State: Area" tokens for LGAs/cities.

import { findLga, lgaOfArea } from "./ng-lgas.ts";

export const CONNECT_NEEDS_APPROVAL = false;
export const DROPSHIP_SHIPPER = "supplier" as const;
export const PAYOUT_TIMING = "instant_split" as const;
export const DELIVERY_COMMISSION_RATE = 0;
/** A partner has this long to accept a new job before it shows in the shop's exceptions. */
export const ACCEPT_WITHIN_HOURS = 4;
/** An accepted job not picked up this long after the shop marked it ready (or after accepting) is a late pickup. */
export const LATE_PICKUP_HOURS = 24;

// ─── Places ──────────────────────────────────────────────────────────────────

export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;
export type NgState = (typeof NG_STATES)[number];

/** Nigeria's six geopolitical zones, so a partner can price "Lagos → South-West" in one row. */
export const NG_REGIONS: Record<string, readonly NgState[]> = {
  "South-West": ["Ekiti", "Lagos", "Ogun", "Ondo", "Osun", "Oyo"],
  "South-East": ["Abia", "Anambra", "Ebonyi", "Enugu", "Imo"],
  "South-South": ["Akwa Ibom", "Bayelsa", "Cross River", "Delta", "Edo", "Rivers"],
  "North-Central": ["Benue", "FCT", "Kogi", "Kwara", "Nasarawa", "Niger", "Plateau"],
  "North-East": ["Adamawa", "Bauchi", "Borno", "Gombe", "Taraba", "Yobe"],
  "North-West": ["Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Sokoto", "Zamfara"],
};

export const NATIONWIDE = "Nationwide";

const words = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STATE_ALIASES: Record<string, NgState> = {
  abuja: "FCT", fct: "FCT", "f c t": "FCT", "federal capital territory": "FCT", "abuja fct": "FCT", "fct abuja": "FCT",
  "port harcourt": "Rivers", ph: "Rivers", ibadan: "Oyo", abeokuta: "Ogun", "benin city": "Edo", benin: "Edo", onitsha: "Anambra",
  awka: "Anambra", aba: "Abia", umuahia: "Abia", owerri: "Imo", jos: "Plateau", ilorin: "Kwara", uyo: "Akwa Ibom", calabar: "Cross River",
  warri: "Delta", asaba: "Delta", akure: "Ondo", osogbo: "Osun", "ado ekiti": "Ekiti", lokoja: "Kogi", makurdi: "Benue", minna: "Niger",
  lafia: "Nasarawa", yola: "Adamawa", maiduguri: "Borno", yenagoa: "Bayelsa", abakaliki: "Ebonyi", sagamu: "Ogun", ota: "Ogun",
};

/** Areas of Lagos and Abuja people type as their city, so "Ikeja" alone still means Lagos. */
const AREA_STATE: Record<string, NgState> = Object.fromEntries([
  ...["victoria island", "vi", "lekki", "ajah", "ikoyi", "lagos island", "ikeja", "yaba", "surulere", "maryland", "ojota", "ketu", "magodo",
    "ojodu", "berger", "ogba", "agege", "gbagada", "ilupeju", "oshodi", "isolo", "mushin", "apapa", "festac", "ojo", "egbeda", "ikotun",
    "alimosho", "ikorodu", "epe", "badagry", "sangotedo", "ibeju lekki", "ebute metta", "amuwo odofin", "idumota", "lagos mainland", "mainland"]
    .map((area) => [area, "Lagos" as NgState]),
  ...["maitama", "asokoro", "wuse", "garki", "utako", "jabi", "gwarinpa", "kubwa", "lugbe", "gwagwalada", "nyanya", "karu"].map((area) => [area, "FCT" as NgState]),
]);

const FCT_NAMES = new Set(["abuja", "fct", "f c t", "federal capital territory", "abuja fct", "fct abuja"]);

const stateWords = (text: string) => words(text).replace(/\bstate\b/g, "").replace(/\s+/g, " ").trim();

/** The text names a state itself ("Lagos", "lagos state", "Abuja", "FCT"), not a city in it. */
function stateNamed(text: string): NgState | null {
  const plain = stateWords(text);
  if (!plain) return null;
  if (FCT_NAMES.has(plain)) return "FCT";
  return NG_STATES.find((state) => words(state) === plain) ?? null;
}

/** "lagos state" / "Abuja" / "FCT" / "Port Harcourt" / "Ikeja" → the state, else null. */
export function canonicalState(text: string | null | undefined): NgState | null {
  const plain = stateWords(String(text ?? ""));
  if (!plain) return null;
  return stateNamed(plain) ?? STATE_ALIASES[plain] ?? AREA_STATE[plain] ?? null;
}

export function regionOf(state: string | null | undefined): string | null {
  if (!state) return null;
  return Object.entries(NG_REGIONS).find(([, states]) => (states as readonly string[]).includes(state))?.[0] ?? null;
}

export interface Place {
  state: NgState | null;
  /** City, LGA or area, as typed ("Ikeja"). */
  area: string | null;
}

/** Where an address is: the state (from the state field, else the city), and the city/area unless it only names the state. */
export function placeOf(address: { state?: string | null; city?: string | null; area?: string | null } | null | undefined): Place {
  const city = String(address?.area ?? address?.city ?? "").trim();
  const state = canonicalState(address?.state) ?? canonicalState(city) ?? (city.includes(",") ? canonicalState(city.split(",").pop()) : null);
  return { state, area: city && !stateNamed(city) ? city : null };
}

export type AreaToken =
  | { kind: "nationwide" }
  | { kind: "region"; region: string }
  | { kind: "state"; state: NgState }
  | { kind: "area"; state: NgState; area: string };

/** "Nationwide" · "South-West" · "Lagos" · "Lagos: Ikeja" · "Ikeja" (a known area) → a token, or null when it isn't a place we know. */
export function parseArea(text: string | null | undefined): AreaToken | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (["nationwide", "all states", "nigeria"].includes(words(raw))) return { kind: "nationwide" };
  const region = Object.keys(NG_REGIONS).find((name) => words(name) === words(raw));
  if (region) return { kind: "region", region };
  const colon = raw.indexOf(":");
  if (colon >= 0) {
    const state = canonicalState(raw.slice(0, colon));
    const area = raw.slice(colon + 1).replace(/\s+/g, " ").trim().slice(0, 60);
    if (!state) return null;
    return area ? { kind: "area", state, area } : { kind: "state", state };
  }
  const state = stateNamed(raw);
  if (state) return { kind: "state", state };
  const cityState = STATE_ALIASES[stateWords(raw)] ?? AREA_STATE[stateWords(raw)];
  return cityState ? { kind: "area", state: cityState, area: raw.replace(/\s+/g, " ").slice(0, 60) } : null;
}

/** The canonical way to write an area token ("lagos : ikeja" → "Lagos: ikeja"). */
export function formatArea(token: AreaToken): string {
  if (token.kind === "nationwide") return NATIONWIDE;
  if (token.kind === "region") return token.region;
  if (token.kind === "state") return token.state;
  return `${token.state}: ${token.area}`;
}

/** Clean list of area tokens from free text or an array; unknown places are dropped and returned separately. */
export function cleanAreas(input: unknown): { areas: string[]; unknown: string[] } {
  const list = Array.isArray(input) ? input.map(String) : String(input ?? "").split(/[\n;,]+/);
  const areas: string[] = [];
  const unknown: string[] = [];
  for (const item of list) {
    const text = item.trim();
    if (!text) continue;
    const token = parseArea(text);
    if (!token) unknown.push(text);
    else if (!areas.includes(formatArea(token))) areas.push(formatArea(token));
  }
  return { areas: areas.slice(0, 200), unknown };
}

/**
 * How well an area token matches a place: 4 the exact area, 3 the state, 2 the region, 1 nationwide, -1 no match.
 * An area token matches when its text is inside the place's area, or when both resolve to the same LGA
 * ("Lagos: Eti-Osa" covers "Lekki Phase 1"; "Lagos: Lekki" covers "Victoria Island"). A place with no known state
 * only matches "Nationwide".
 */
export function areaScore(token: AreaToken | string | null, place: Place): number {
  const parsed = typeof token === "string" ? parseArea(token) : token;
  if (!parsed) return -1;
  if (parsed.kind === "nationwide") return 1;
  if (!place.state) return -1;
  if (parsed.kind === "region") return NG_REGIONS[parsed.region]?.includes(place.state) ? 2 : -1;
  if (parsed.kind === "state") return parsed.state === place.state ? 3 : -1;
  if (parsed.state !== place.state || !place.area) return -1;
  if (words(place.area).includes(words(parsed.area))) return 4;
  // A token that names a whole LGA ("Lagos: Eti-Osa") covers every area in it ("Lekki Phase 1"). A token naming an
  // area inside one ("Lagos: Lekki") covers only that area, never its neighbours in the same LGA.
  const lga = findLga(parsed.state, parsed.area);
  return lga && lga === lgaOfArea(place.state, place.area) ? 4 : -1;
}

/** The best score of any token in the list (an empty list covers nothing). */
export function coverScore(tokens: readonly string[], place: Place) {
  return tokens.reduce((best, token) => Math.max(best, areaScore(token, place)), -1);
}

export const covers = (tokens: readonly string[], place: Place) => coverScore(tokens, place) >= 0;

// ─── Services and sizes ──────────────────────────────────────────────────────

export const PARTNER_SERVICES = ["doorstep", "pickup_point", "same_day", "interstate"] as const;
export type PartnerService = (typeof PARTNER_SERVICES)[number];
export const SERVICE_LABELS: Record<PartnerService, string> = {
  doorstep: "Doorstep delivery",
  pickup_point: "Pickup points",
  same_day: "Same-day delivery",
  interstate: "Interstate delivery",
};

/** What a rate row can price (interstate is a coverage capability, not a separate price). */
export const RATE_SERVICES = ["doorstep", "pickup_point", "same_day"] as const;
export type RateService = (typeof RATE_SERVICES)[number];

/** What a shop can offer customers for a connected partner. */
export const OFFER_SERVICES = ["doorstep", "pickup_point"] as const;

export function cleanServices(input: unknown): PartnerService[] {
  const list = Array.isArray(input) ? input.map(String) : String(input ?? "").split(/[,\n]+/);
  const out: PartnerService[] = [];
  for (const item of list) {
    const key = words(item).replace(/ /g, "_").replace(/^pickup_points?$|^pick_up_points?$/, "pickup_point").replace(/^sameday$/, "same_day").replace(/^door_?step(_delivery)?$/, "doorstep");
    if ((PARTNER_SERVICES as readonly string[]).includes(key) && !out.includes(key as PartnerService)) out.push(key as PartnerService);
  }
  return out;
}

export const SIZE_BANDS = ["small", "medium", "bulky"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const SIZE_BAND_LABELS: Record<SizeBand, string> = { small: "Small (up to 2kg)", medium: "Medium (2–10kg)", bulky: "Bulky (over 10kg)" };
export const SIZE_BAND_MAX_KG: Record<SizeBand, number> = { small: 2, medium: 10, bulky: Infinity };

export const isSizeBand = (value: unknown): value is SizeBand => typeof value === "string" && (SIZE_BANDS as readonly string[]).includes(value);

export function toKg(weight: number | null | undefined, unit: string | null | undefined) {
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) return null;
  const u = String(unit ?? "kg").toLowerCase();
  if (u === "g") return weight / 1000;
  if (u === "lb" || u === "lbs") return weight * 0.4536;
  if (u === "oz") return weight * 0.02835;
  return weight;
}

export function bandForKg(kg: number): SizeBand {
  if (kg <= SIZE_BAND_MAX_KG.small) return "small";
  if (kg <= SIZE_BAND_MAX_KG.medium) return "medium";
  return "bulky";
}

const bandRank = (band: SizeBand) => SIZE_BANDS.indexOf(band);
export const biggerBand = (a: SizeBand, b: SizeBand): SizeBand => (bandRank(a) >= bandRank(b) ? a : b);

export interface ParcelItem {
  sizeBand?: string | null;
  weight?: number | null;
  weightUnit?: string | null;
  quantity: number;
}

/** One item's band: the product's own band, else its weight, else the shop's default. */
export function itemBand(item: ParcelItem, fallback: SizeBand = "small"): SizeBand {
  if (isSizeBand(item.sizeBand)) return item.sizeBand;
  const kg = toKg(item.weight, item.weightUnit);
  return kg === null ? fallback : bandForKg(kg);
}

/** A parcel's band (decision 3): the bigger of its largest item's band and the band of the weights added up. */
export function parcelBand(items: readonly ParcelItem[], fallback: SizeBand = "small"): SizeBand {
  let band: SizeBand = "small";
  let kg = 0;
  for (const item of items) {
    band = biggerBand(band, itemBand(item, fallback));
    const each = toKg(item.weight, item.weightUnit);
    if (each !== null) kg += each * Math.max(1, item.quantity);
  }
  return kg > 0 ? biggerBand(band, bandForKg(kg)) : band;
}

// ─── Rate cards ──────────────────────────────────────────────────────────────

export interface RateRow {
  id: string;
  /** Origin zone (an area token). */
  from: string;
  /** Destination zone. */
  to: string;
  service: RateService;
  sizeBand: SizeBand;
  price: number;
  minDays: number;
  maxDays: number;
}

export interface RateCardInput {
  rows: unknown;
  failedAttemptFee?: unknown;
  returnFee?: unknown;
  notes?: unknown;
}

export const MAX_RATE_ROWS = 300;

const money = (value: unknown) => {
  const n = typeof value === "string" ? Number(value.replace(/[₦,\s]/g, "")) : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/** Checks a rate card. Every row needs places we know, a service, a size band, a price and a timeframe. */
export function validateRateCard(input: RateCardInput):
  | { ok: true; card: { rows: RateRow[]; failedAttemptFee: number; returnFee: number; notes: string | null } }
  | { ok: false; error: string } {
  const raw = Array.isArray(input.rows) ? input.rows : [];
  if (raw.length === 0) return { ok: false, error: "Add at least one rate: where from, where to, the service, the size and the price." };
  if (raw.length > MAX_RATE_ROWS) return { ok: false, error: `A rate card can have up to ${MAX_RATE_ROWS} rows.` };
  const rows: RateRow[] = [];
  const seen = new Set<string>();
  for (const [index, value] of raw.entries()) {
    const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const n = index + 1;
    const from = parseArea(String(row.from ?? ""));
    const to = parseArea(String(row.to ?? ""));
    if (!from) return { ok: false, error: `Row ${n}: we don't know the place "${String(row.from ?? "")}". Use a state, a region, "Nationwide" or "State: Area".` };
    if (!to) return { ok: false, error: `Row ${n}: we don't know the place "${String(row.to ?? "")}". Use a state, a region, "Nationwide" or "State: Area".` };
    const service = String(row.service ?? "");
    if (!(RATE_SERVICES as readonly string[]).includes(service)) return { ok: false, error: `Row ${n}: pick the service (doorstep, pickup point or same-day).` };
    if (!isSizeBand(row.sizeBand)) return { ok: false, error: `Row ${n}: pick the size (small, medium or bulky).` };
    const price = money(row.price);
    if (price === null || price <= 0) return { ok: false, error: `Row ${n}: type the price in naira.` };
    const minDays = Math.round(Number(row.minDays ?? 0));
    const maxDays = Math.round(Number(row.maxDays ?? row.minDays ?? 0));
    if (!Number.isFinite(minDays) || !Number.isFinite(maxDays) || minDays < 0 || maxDays < minDays || maxDays > 60) {
      return { ok: false, error: `Row ${n}: the timeframe should be days, for example 1 to 2 (0 means the same day).` };
    }
    if (service === "same_day" && maxDays > 0) return { ok: false, error: `Row ${n}: same-day rates deliver in 0 days.` };
    const key = [formatArea(from), formatArea(to), service, row.sizeBand].join("|").toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Row ${n}: the same route, service and size is already on the card.` };
    seen.add(key);
    rows.push({ id: String(row.id || `r${n}`).slice(0, 40), from: formatArea(from), to: formatArea(to), service: service as RateService, sizeBand: row.sizeBand, price, minDays, maxDays });
  }
  const failedAttemptFee = money(input.failedAttemptFee) ?? 0;
  const returnFee = money(input.returnFee) ?? 0;
  const notes = String(input.notes ?? "").trim().slice(0, 500) || null;
  return { ok: true, card: { rows, failedAttemptFee, returnFee, notes } };
}

/** Rows read back from the database (already validated when saved; anything odd is skipped). */
export function readRateRows(value: unknown): RateRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is RateRow => {
    const r = row as Partial<RateRow>;
    return !!r && typeof r.from === "string" && typeof r.to === "string" && (RATE_SERVICES as readonly string[]).includes(String(r.service)) && isSizeBand(r.sizeBand) && typeof r.price === "number" && r.price > 0;
  });
}

export interface RouteQuery {
  origin: Place;
  destination: Place;
  service: RateService;
  sizeBand: SizeBand;
}

/**
 * The rate for a route: the row whose places match most closely (an area beats a state, a state a region, a region
 * nationwide), the cheapest on a tie. A parcel can use a row for its size or a bigger one, never a smaller one.
 */
export function bestRate(rows: readonly RateRow[], query: RouteQuery): RateRow | null {
  let best: { row: RateRow; score: number } | null = null;
  for (const row of rows) {
    if (row.service !== query.service) continue;
    if (bandRank(row.sizeBand) < bandRank(query.sizeBand)) continue;
    const from = areaScore(row.from, query.origin);
    const to = areaScore(row.to, query.destination);
    if (from < 0 || to < 0) continue;
    // Closest place first, then the exact size band, then the price.
    const score = (from + to) * 10 - (bandRank(row.sizeBand) - bandRank(query.sizeBand));
    if (!best || score > best.score || (score === best.score && row.price < best.row.price)) best = { row, score };
  }
  return best?.row ?? null;
}

/** The lowest price on a card, for "from ₦2,500" on partner cards. */
export function startingPrice(rows: readonly RateRow[]) {
  return rows.length ? Math.min(...rows.map((row) => row.price)) : null;
}

/** "Same day" · "1 day" · "1–2 days". */
export function timeframeWords(minDays: number, maxDays: number) {
  if (maxDays <= 0) return "Same day";
  if (minDays === maxDays) return `${maxDays} day${maxDays === 1 ? "" : "s"}`;
  return `${minDays}–${maxDays} days`;
}

/** The shortest and longest timeframe on a card, for partner cards: "Same day – 3 days". */
export function cardTimeframe(rows: readonly RateRow[]) {
  if (!rows.length) return null;
  const min = Math.min(...rows.map((row) => row.minDays));
  const max = Math.max(...rows.map((row) => row.maxDays));
  return timeframeWords(min, max);
}

// ─── "Where I sell" ──────────────────────────────────────────────────────────

export const SELL_AREAS = ["one_state", "selected", "nationwide"] as const;
export type SellArea = (typeof SELL_AREAS)[number];

export function sellsTo(settings: { sellArea: string; sellStates: readonly string[] }, place: Place) {
  if (settings.sellArea !== "one_state" && settings.sellArea !== "selected") return true;
  return !!place.state && settings.sellStates.includes(place.state);
}

/** Does a partner serve some of where the shop sells, from where it ships? (For "Find partners".) */
export function partnerMatchesShop(
  partner: { pickupAreas: readonly string[]; deliveryAreas: readonly string[] },
  shop: { origin: Place | null; sellArea: string; sellStates: readonly string[] },
) {
  if (shop.origin?.state && !covers(partner.pickupAreas, shop.origin)) return false;
  if (shop.sellArea === "nationwide" || !shop.sellStates.length) return partner.deliveryAreas.length > 0;
  return shop.sellStates.some((state) => covers(partner.deliveryAreas, { state: canonicalState(state), area: null }));
}

// ─── Checkout options ────────────────────────────────────────────────────────

export interface MarketPartner {
  id: string;
  name: string;
  services: readonly string[];
  pickupAreas: readonly string[];
  deliveryAreas: readonly string[];
  offersPayOnDelivery: boolean;
  /** The card that prices this shop: an accepted private card, else the public one. */
  card: { id: string; rows: readonly RateRow[] } | null;
  pickupPoints: ReadonlyArray<{ id: string; name: string; address: string; state: string; area: string | null; hours: string | null; phone: string | null }>;
}

export interface MarketConnection {
  id: string;
  services: readonly string[];
  showPartnerName: boolean;
  label: string | null;
  ownerPod: boolean;
  partnerPod: boolean;
  partner: MarketPartner;
}

export interface Shipment {
  /** own (the shop's stock) or supplier:<supplierId>. */
  key: string;
  origin: Place;
  sizeBand: SizeBand;
  connections: readonly MarketConnection[];
  /** A supplier that delivers its own parcels: its fee and the states it drives to (empty: its own state only). */
  selfDelivery?: { fee: number; states: readonly string[] } | null;
}

export type MarketOptionKind = "self_pickup" | "doorstep" | "same_day" | "pickup_point" | "fallback" | "multi";

/** One partner job an option books: which shipment, who carries it, and the price it was quoted at. */
export interface OptionPart {
  shipmentKey: string;
  connectionId: string | null;
  partnerId: string | null;
  service: "doorstep" | "pickup_point" | "same_day" | "self_pickup" | "fallback" | "supplier_self";
  price: number;
  rateCardId: string | null;
  pointId: string | null;
  sizeBand: SizeBand;
  minDays: number;
  maxDays: number;
}

/** A delivery option the customer can choose (the same base shape as cart-checkout's DeliveryOption). */
export interface MarketOption {
  id: string;
  name: string;
  price: number;
  estimatedDays: string | null;
  /** The customer collects it (from the seller or a pickup point). */
  pickup: boolean;
  kind: MarketOptionKind;
  /** What the customer sees under the name: the partner (or the shop's label), an address, the hours. */
  detail: string | null;
  point?: { name: string; address: string; hours: string | null; phone: string | null };
  /** Pay on delivery: allowed for this option (partner options: both the shop and the partner opted in). */
  pod: boolean;
  parts: OptionPart[];
}

export interface MarketChoice {
  covered: boolean;
  options: MarketOption[];
  /** Why there's nothing to choose, in words for the customer. */
  reason: string | null;
  /** More than one parcel (items from different places), each with its own fee. */
  shipmentCount: number;
}

export interface CheckoutSettingsInput {
  sellArea: string;
  sellStates: readonly string[];
  selfPickup: boolean;
  pickupAddress: string | null;
  pickupHours: string | null;
  pickupInstructions: string | null;
  fallback: string;
  fallbackFee: number;
}

interface Quote {
  connection: MarketConnection;
  service: RateService;
  row: RateRow;
}

/** Can this connection carry this shipment to the customer with this service, and at what rate? */
export function quoteFor(connection: MarketConnection, shipment: Pick<Shipment, "origin" | "sizeBand">, destination: Place, service: RateService): Quote | null {
  const partner = connection.partner;
  if (!partner.card) return null;
  // The shop offers doorstep or pickup points per partner; same-day is a faster doorstep, offered with doorstep.
  const offered = service === "same_day" ? connection.services.includes("doorstep") : connection.services.includes(service);
  if (!offered || !partner.services.includes(service)) return null;
  if (partner.pickupAreas.length && !covers(partner.pickupAreas, shipment.origin)) return null;
  if (partner.deliveryAreas.length && !covers(partner.deliveryAreas, destination)) return null;
  const interstate = !!shipment.origin.state && !!destination.state && shipment.origin.state !== destination.state;
  if (interstate && !partner.services.includes("interstate")) return null;
  const row = bestRate(partner.card.rows, { origin: shipment.origin, destination, service, sizeBand: shipment.sizeBand });
  return row ? { connection, service, row } : null;
}

const connectionPod = (connection: MarketConnection) => connection.ownerPod && connection.partnerPod && connection.partner.offersPayOnDelivery;

const partFrom = (shipment: Shipment, quote: Quote, pointId: string | null = null): OptionPart => ({
  shipmentKey: shipment.key,
  connectionId: quote.connection.id,
  partnerId: quote.connection.partner.id,
  service: quote.service,
  price: quote.row.price,
  rateCardId: quote.connection.partner.card?.id ?? null,
  pointId,
  sizeBand: shipment.sizeBand,
  minDays: quote.row.minDays,
  maxDays: quote.row.maxDays,
});

const labelFor = (connection: MarketConnection, fallback: string) =>
  connection.showPartnerName ? connection.partner.name : connection.label?.trim() || fallback;

const cheapest = (quotes: Quote[]) => quotes.reduce<Quote | null>((best, quote) => (!best || quote.row.price < best.row.price || (quote.row.price === best.row.price && quote.row.maxDays < best.row.maxDays) ? quote : best), null);

const MAX_POINTS = 8;

/**
 * The delivery options a customer sees at checkout (spec §6): pick up from the seller, doorstep delivery and
 * pickup points from the connected partners that cover the route, or the seller's fallback. A cart from more than
 * one place (dropship from a supplier) is several parcels, each priced on its own and added up.
 */
export function buildMarketChoice(input: { settings: CheckoutSettingsInput; shipments: readonly Shipment[]; destination: Place }): MarketChoice {
  const { settings, shipments, destination } = input;
  const shipmentCount = shipments.length;
  const own = shipments.find((shipment) => shipment.key === "own");
  const selfPickup: MarketOption | null =
    settings.selfPickup && shipmentCount === 1 && own
      ? {
          id: "self_pickup",
          name: "Pick up from the seller",
          price: 0,
          estimatedDays: null,
          pickup: true,
          kind: "self_pickup",
          detail: [settings.pickupAddress, settings.pickupHours, settings.pickupInstructions].filter(Boolean).join(" · ") || null,
          pod: false,
          parts: [{ shipmentKey: "own", connectionId: null, partnerId: null, service: "self_pickup", price: 0, rateCardId: null, pointId: null, sizeBand: own.sizeBand, minDays: 0, maxDays: 0 }],
        }
      : null;

  if (!sellsTo(settings, destination)) {
    return selfPickup
      ? { covered: true, options: [selfPickup], reason: "This shop doesn't deliver to your state. You can pick up from the seller.", shipmentCount }
      : { covered: false, options: [], reason: "This shop doesn't deliver to your state yet.", shipmentCount };
  }

  const options: MarketOption[] = selfPickup ? [selfPickup] : [];

  if (shipmentCount === 1) {
    const shipment = shipments[0]!;
    // Doorstep and same-day: each named partner on its own; partners shown under the shop's label share one option (the cheapest).
    for (const service of ["doorstep", "same_day"] as const) {
      const quotes = shipment.connections.map((connection) => quoteFor(connection, shipment, destination, service)).filter((quote): quote is Quote => !!quote);
      const named = quotes.filter((quote) => quote.connection.showPartnerName);
      const generic = new Map<string, Quote[]>();
      for (const quote of quotes.filter((entry) => !entry.connection.showPartnerName)) {
        const label = labelFor(quote.connection, service === "same_day" ? "Same-day delivery" : "Standard delivery");
        generic.set(label, [...(generic.get(label) ?? []), quote]);
      }
      const picks: Array<{ quote: Quote; label: string }> = [
        ...named.map((quote) => ({ quote, label: quote.connection.partner.name })),
        ...[...generic].map(([label, list]) => ({ quote: cheapest(list)!, label })),
      ];
      for (const { quote, label } of picks.sort((a, b) => a.quote.row.price - b.quote.row.price)) {
        options.push({
          id: `${service === "same_day" ? "s" : "d"}:${quote.connection.id}`,
          name: service === "same_day" ? "Same-day delivery" : "Doorstep delivery",
          price: quote.row.price,
          estimatedDays: timeframeWords(quote.row.minDays, quote.row.maxDays),
          pickup: false,
          kind: service,
          detail: label,
          pod: connectionPod(quote.connection),
          parts: [partFrom(shipment, quote)],
        });
      }
    }
    const self = selfDeliveryPart(shipment, destination);
    if (self) {
      options.push({ id: `o:${shipment.key}`, name: "Doorstep delivery", price: self.price, estimatedDays: timeframeWords(self.minDays, self.maxDays), pickup: false, kind: "doorstep", detail: "Standard delivery", pod: false, parts: [self] });
    }
    // Pickup points in the customer's state, nearest-named first.
    const pointOptions: Array<MarketOption & { rank: number }> = [];
    for (const connection of shipment.connections) {
      const quote = quoteFor(connection, shipment, destination, "pickup_point");
      if (!quote) continue;
      for (const point of connection.partner.pickupPoints) {
        const where: Place = { state: canonicalState(point.state), area: point.area };
        if (!where.state || where.state !== destination.state) continue;
        const sameArea = !!destination.area && !!point.area && words(destination.area).includes(words(point.area));
        pointOptions.push({
          id: `p:${connection.id}:${point.id}`,
          name: `Pickup point: ${point.name}`,
          price: quote.row.price,
          estimatedDays: timeframeWords(quote.row.minDays, quote.row.maxDays),
          pickup: true,
          kind: "pickup_point",
          detail: [point.address, point.area].filter(Boolean).join(", ") + (connection.showPartnerName ? ` · ${connection.partner.name}` : ""),
          point: { name: point.name, address: point.address, hours: point.hours, phone: point.phone },
          pod: connectionPod(connection),
          parts: [partFrom(shipment, quote, point.id)],
          rank: (sameArea ? 0 : 1) * 1e9 + quote.row.price,
        });
      }
    }
    options.push(...pointOptions.sort((a, b) => a.rank - b.rank).slice(0, MAX_POINTS).map(({ rank: _rank, ...option }) => option));
  } else {
    // Several parcels: the cheapest doorstep delivery for each, added up.
    const parts: OptionPart[] = [];
    let complete = true;
    for (const shipment of shipments) {
      const quote = cheapest(shipment.connections.map((connection) => quoteFor(connection, shipment, destination, "doorstep")).filter((entry): entry is Quote => !!entry));
      const self = selfDeliveryPart(shipment, destination);
      if (quote && (!self || quote.row.price <= self.price)) parts.push(partFrom(shipment, quote));
      else if (self) parts.push(self);
      else if (shipment.key === "own" && settings.fallback === "flat_fee" && settings.fallbackFee > 0) parts.push(fallbackPart(shipment, settings.fallbackFee));
      else complete = false;
    }
    if (complete && parts.length) {
      const minDays = Math.max(...parts.map((part) => part.minDays));
      const maxDays = Math.max(...parts.map((part) => part.maxDays));
      const pod = parts.every((part) => {
        const shipment = shipments.find((entry) => entry.key === part.shipmentKey);
        const connection = shipment?.connections.find((entry) => entry.id === part.connectionId);
        return connection ? connectionPod(connection) : false;
      });
      options.push({
        id: "multi:doorstep",
        name: `Doorstep delivery (${parts.length} parcels)`,
        price: Math.round(parts.reduce((sum, part) => sum + part.price, 0) * 100) / 100,
        estimatedDays: timeframeWords(minDays, maxDays),
        pickup: false,
        kind: "multi",
        detail: "Your items ship from different places, so each parcel has its own delivery fee.",
        pod,
        parts,
      });
    }
  }

  const hasDelivery = options.some((option) => option.kind !== "self_pickup");
  if (!hasDelivery && settings.fallback === "flat_fee" && settings.fallbackFee > 0 && shipmentCount === 1 && own) {
    options.push({
      id: "fallback",
      name: "Delivery",
      price: settings.fallbackFee,
      estimatedDays: null,
      pickup: false,
      kind: "fallback",
      detail: "The seller arranges this delivery.",
      pod: false,
      parts: [fallbackPart(own, settings.fallbackFee)],
    });
  }
  if (!options.length) return { covered: false, options, reason: "No delivery is available to this address yet. Try another address, or contact the seller.", shipmentCount };
  return { covered: true, options, reason: null, shipmentCount };
}

/** The supplier drives this parcel to the customer itself (a supplier's "I deliver myself"), when it covers the address. */
export function selfDeliveryPart(shipment: Shipment, destination: Place): OptionPart | null {
  const own = shipment.selfDelivery;
  if (!own || !shipment.key.startsWith("supplier:") || !(own.fee > 0) || !destination.state) return null;
  const states = own.states.length ? own.states.map(canonicalState) : [shipment.origin.state];
  if (!states.includes(destination.state)) return null;
  const local = shipment.origin.state === destination.state;
  return { shipmentKey: shipment.key, connectionId: null, partnerId: null, service: "supplier_self", price: own.fee, rateCardId: null, pointId: null, sizeBand: shipment.sizeBand, minDays: local ? 1 : 2, maxDays: local ? 2 : 5 };
}

/** The fee each supplier earns for delivering its own parcel in this plan (added to its share of the payment). */
export const supplierSelfShipments = (plan: DeliveryPlan) => plan.shipments.filter((part) => part.service === "supplier_self");

function fallbackPart(shipment: Shipment, price: number): OptionPart {
  return { shipmentKey: shipment.key, connectionId: null, partnerId: null, service: "fallback", price, rateCardId: null, pointId: null, sizeBand: shipment.sizeBand, minDays: 0, maxDays: 0 };
}

export function chooseMarketOption(choice: MarketChoice, optionId?: string | null) {
  const option = choice.options.find((entry) => entry.id === optionId) ?? choice.options[0] ?? null;
  return { option, fee: option?.price ?? 0 };
}

// ─── The order's delivery plan (RetailOrder.logisticsDetails.delivery) ───────

export interface DeliveryPlan {
  version: 1;
  optionId: string;
  kind: MarketOptionKind;
  pod: boolean;
  /** One per parcel: the partner job is created from it once the order is paid (or placed, pay on delivery). */
  shipments: Array<OptionPart & { bookingId: string | null }>;
}

export function planFromOption(option: MarketOption): DeliveryPlan {
  return { version: 1, optionId: option.id, kind: option.kind, pod: option.pod, shipments: option.parts.map((part) => ({ ...part, bookingId: null })) };
}

export function readDeliveryPlan(logisticsDetails: unknown): DeliveryPlan | null {
  const value = logisticsDetails && typeof logisticsDetails === "object" ? (logisticsDetails as Record<string, unknown>).delivery : null;
  if (!value || typeof value !== "object") return null;
  const plan = value as Partial<DeliveryPlan>;
  return plan.version === 1 && Array.isArray(plan.shipments) ? (plan as DeliveryPlan) : null;
}

/** The plan inside RetailOrder.logisticsDetails, to keep when the seller replaces the rest (how it's sent). */
export function keptDeliveryPlan(logisticsDetails: unknown): { delivery?: unknown } {
  const delivery = logisticsDetails && typeof logisticsDetails === "object" ? (logisticsDetails as Record<string, unknown>).delivery : undefined;
  return delivery ? { delivery } : {};
}

/** The parcels a partner carries (not self pickup or the seller's own fallback delivery). */
export const partnerShipments = (plan: DeliveryPlan) => plan.shipments.filter((part) => !!part.partnerId && !!part.connectionId);

// ─── Status model (spec §9) ──────────────────────────────────────────────────

export const JOB_STATUS_WORDS: Record<string, string> = {
  pending: "Sent to partner",
  confirmed: "Accepted",
  declined: "Declined",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  at_pickup_point: "At pickup point",
  delivered: "Delivered",
  failed: "Delivery attempt failed",
  returning: "Returning to sender",
  returned: "Returned",
  cancelled: "Cancelled",
};

export interface TimelineJob {
  status: string;
  service: string | null;
  createdAt: Date | string;
  acceptedAt?: Date | string | null;
  readyAt?: Date | string | null;
  pickedUpAt?: Date | string | null;
  outForDeliveryAt?: Date | string | null;
  atPickupPointAt?: Date | string | null;
  deliveredAt?: Date | string | null;
}

export interface TimelineStep {
  key: string;
  label: string;
  done: boolean;
  at: string | null;
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null);

const STAGE_ORDER = ["pending", "confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "delivered"];

/**
 * The plain-language timeline a customer and the shop see (spec §6.3, §5.7). Self pickup: Order placed → Ready
 * for pickup → Collected. Partner jobs: Order placed → Sent to partner → Accepted → Picked up → In transit → Out for
 * delivery (doorstep) or At pickup point (pickup points) → Delivered / Collected.
 */
export function deliveryTimeline(order: { createdAt: Date | string; deliveredAt?: Date | string | null }, job: TimelineJob | null, kind: MarketOptionKind | null): TimelineStep[] {
  if (kind === "self_pickup" || !job) {
    const ready = !!job?.readyAt;
    const collected = !!order.deliveredAt;
    return [
      { key: "placed", label: "Order placed", done: true, at: iso(order.createdAt) },
      { key: "ready", label: kind === "self_pickup" ? "Ready for pickup" : "Being prepared", done: ready || collected, at: iso(job?.readyAt) },
      { key: "delivered", label: kind === "self_pickup" ? "Collected" : "Delivered", done: collected, at: iso(order.deliveredAt) },
    ];
  }
  const point = job.service === "pickup_point";
  const reached = STAGE_ORDER.indexOf(job.status === "returned" || job.status === "returning" || job.status === "failed" ? "picked_up" : job.status);
  const doneAt = (stage: string) => reached >= STAGE_ORDER.indexOf(stage);
  return [
    { key: "placed", label: "Order placed", done: true, at: iso(order.createdAt) },
    { key: "pending", label: "Sent to delivery partner", done: true, at: iso(job.createdAt) },
    { key: "confirmed", label: "Accepted", done: doneAt("confirmed"), at: iso(job.acceptedAt) },
    { key: "picked_up", label: "Picked up", done: doneAt("picked_up"), at: iso(job.pickedUpAt) },
    { key: "in_transit", label: "In transit", done: doneAt("in_transit") || doneAt(point ? "at_pickup_point" : "out_for_delivery"), at: null },
    point
      ? { key: "at_pickup_point", label: "At pickup point", done: doneAt("at_pickup_point"), at: iso(job.atPickupPointAt) }
      : { key: "out_for_delivery", label: "Out for delivery", done: doneAt("out_for_delivery"), at: iso(job.outForDeliveryAt) },
    { key: "delivered", label: point ? "Collected" : "Delivered", done: job.status === "delivered", at: iso(job.deliveredAt) },
  ];
}

// ─── Exceptions (spec §5.7) ──────────────────────────────────────────────────

export type ExceptionKind = "declined" | "not_accepted" | "late_pickup" | "failed_attempt" | "address_problem" | "returning";
export const EXCEPTION_WORDS: Record<ExceptionKind, string> = {
  declined: "Partner declined",
  not_accepted: "Not accepted in time",
  late_pickup: "Late pickup",
  failed_attempt: "Failed delivery attempt",
  address_problem: "Address problem",
  returning: "Return in progress",
};

const ADDRESS_WORDS = /address|not found|can'?t find|cannot find|wrong (house|street|place)|no such|unreachable location|landmark/i;

/** Why a job needs the shop's attention now, or null. Jobs already replaced by another never do. */
export function jobException(
  job: { status: string; acceptBy?: Date | string | null; acceptedAt?: Date | string | null; readyAt?: Date | string | null; pickedUpAt?: Date | string | null; failedReason?: string | null; replacedById?: string | null; pickupWindowEnd?: Date | string | null },
  now: Date = new Date(),
): ExceptionKind | null {
  if (job.replacedById) return null;
  const t = now.getTime();
  if (job.status === "declined") return "declined";
  if (job.status === "pending" && job.acceptBy && new Date(job.acceptBy).getTime() < t) return "not_accepted";
  if (job.status === "confirmed" && !job.pickedUpAt) {
    const due = job.pickupWindowEnd ? new Date(job.pickupWindowEnd).getTime() : job.readyAt ? new Date(job.readyAt).getTime() + LATE_PICKUP_HOURS * 3_600_000 : null;
    if (due !== null && due < t) return "late_pickup";
  }
  if (job.status === "failed") return ADDRESS_WORDS.test(job.failedReason ?? "") ? "address_problem" : "failed_attempt";
  if (job.status === "returning") return "returning";
  return null;
}

/** Jobs a shop can hand to another partner: declined, never accepted, or accepted but not picked up in time. */
export const canReassign = (kind: ExceptionKind | null) => kind === "declined" || kind === "not_accepted" || kind === "late_pickup";

// ─── Partner stats and ranking (spec §4.8, §7.3) ─────────────────────────────

export interface StatsJob {
  status: string;
  deliveredAt?: Date | string | null;
  estimatedDelivery?: Date | string | null;
  failedAttempts?: number | null;
}

export interface PartnerStats {
  completed: number;
  /** 0–100, or null with too few deliveries to say. */
  onTimeRate: number | null;
  failedRate: number | null;
}

/** Fewer finished in-app jobs than this and the rates aren't shown (too few to be fair). */
export const MIN_JOBS_FOR_RATES = 5;

export function partnerStats(jobs: readonly StatsJob[]): PartnerStats {
  const delivered = jobs.filter((job) => job.status === "delivered");
  const finished = jobs.filter((job) => ["delivered", "returned", "returning"].includes(job.status) || (job.status === "failed" && (job.failedAttempts ?? 0) > 0));
  const timed = delivered.filter((job) => job.deliveredAt && job.estimatedDelivery);
  const onTime = timed.filter((job) => new Date(job.deliveredAt!).getTime() <= new Date(job.estimatedDelivery!).getTime() + 12 * 3_600_000);
  const failed = finished.filter((job) => job.status !== "delivered" || (job.failedAttempts ?? 0) > 0);
  return {
    completed: delivered.length,
    onTimeRate: timed.length >= MIN_JOBS_FOR_RATES ? Math.round((onTime.length / timed.length) * 100) : null,
    failedRate: finished.length >= MIN_JOBS_FOR_RATES ? Math.round((failed.length / finished.length) * 100) : null,
  };
}

/**
 * Order for "Find partners": verified partners first, then a score that rewards in-app volume, on-time delivery
 * and rating, and how closely they cover the shop's selling areas (the ranking boost of spec §7.3).
 */
export function rankScore(input: { stats: PartnerStats; rating: number; ratingCount: number; match: number; verified: boolean }) {
  const volume = Math.min(1, Math.log10(1 + input.stats.completed) / 3); // 1,000 jobs = full marks
  const onTime = input.stats.onTimeRate === null ? 0.5 : input.stats.onTimeRate / 100;
  const failed = input.stats.failedRate === null ? 0 : input.stats.failedRate / 100;
  const rating = input.ratingCount > 0 ? input.rating / 5 : 0.5;
  return (input.verified ? 100 : 0) + input.match * 10 + volume * 25 + onTime * 25 + rating * 15 - failed * 20;
}

// ─── Chat guardrails (spec §7.3) ─────────────────────────────────────────────

export type OffPlatformSignal = "phone" | "bank_account" | "email" | "pay_direct";

const PHONE = /(?:\+?234[\s-]?|\b0)[789][01]\d(?:[\s-]?\d){7}\b/;
const ACCOUNT = /\b\d{10}\b/;
const BANK_WORDS = /\b(account|acct|a\/c|acc no|bank|gtb|gtbank|access|zenith|uba|first ?bank|opay|palmpay|moniepoint|kuda|wema|fidelity|sterling|union bank|polaris|stanbic|fcmb|ecobank)\b/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PAY_DIRECT = /\b(pay|send|transfer)\b[^.!?\n]{0,30}\b(me|my account|to me|directly|direct)\b|\bpay (me )?(directly|outside|off the app)\b|\boutside (the )?(app|shopinbos)\b|\bmy (personal )?(account|number)\b|\bcash (only|directly)\b|\bwhatsapp me\b|\bcall me on\b/i;

/** What in a chat message looks like moving a job off the app. Nothing is blocked; the app shows a gentle note. */
export function offPlatformSignals(text: string): OffPlatformSignal[] {
  const found: OffPlatformSignal[] = [];
  const plain = String(text ?? "");
  if (PHONE.test(plain)) found.push("phone");
  if (ACCOUNT.test(plain.replace(PHONE, "")) && BANK_WORDS.test(plain)) found.push("bank_account");
  if (EMAIL.test(plain)) found.push("email");
  if (PAY_DIRECT.test(plain)) found.push("pay_direct");
  return found;
}

// Says only what's true today. Once the terms of service ban off-platform payments for jobs arranged here (spec
// §7.3, waiting on legal), it can add "and are against our terms".
export const OFF_PLATFORM_WARNING =
  "Keep jobs and payments in Shopinbos. In-app jobs are paid automatically, tracked, and count towards your rating. Payments arranged outside the app aren't protected by Shopinbos.";

// ─── Pay on delivery (spec §8) ───────────────────────────────────────────────

export const POD_DISCLAIMER =
  "Pay on delivery is an arrangement between you and your logistics partner. Cash is collected by the partner, and settlement is between you and them. Shopinbos does not handle, hold or guarantee pay-on-delivery funds.";

/** The same arrangement as the partner sees it (coverage and connections pages). */
export const POD_DISCLAIMER_PARTNER =
  "Pay on delivery is an arrangement between you and the shop. Your rider collects the cash from the customer, and you settle it with the shop directly. Shopinbos does not handle, hold or guarantee pay-on-delivery funds.";

// ─── Decline reasons ─────────────────────────────────────────────────────────

export const DECLINE_REASONS = [
  "We don't cover this route right now",
  "No rider free in time",
  "The parcel is too big for us",
  "The address is incomplete",
  "Other",
] as const;

// ─── Report a problem (spec §6.4) ────────────────────────────────────────────

export const ISSUE_KINDS = ["late", "not_delivered", "damaged", "wrong_item"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const ISSUE_WORDS: Record<IssueKind, string> = {
  late: "It's late",
  not_delivered: "It wasn't delivered",
  damaged: "It arrived damaged",
  wrong_item: "Wrong item",
};
/** Problems that are about the delivery itself, so the partner hears about them too. */
export const PARTNER_ISSUES: readonly IssueKind[] = ["late", "not_delivered", "damaged"];
