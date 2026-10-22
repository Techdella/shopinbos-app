import { NATIONWIDE, NG_STATES, cleanAreas, parseArea, type RateRow, type RateService, type SizeBand } from "./delivery-market.ts";

// Setting up a delivery company, shared by the web set-up (src/components/onboarding/LogisticsOnboarding.tsx) and the
// phone app's (apps/mobile/src/app/logistics/setup.tsx, re-exported by apps/mobile/src/lib/logistics-pure.ts): prices
// as typed, coverage choices ("same states / all of Nigeria / selected states") as area tokens, and the starter rate
// card built from what the partner picked. SIZE_KEYS and SERVICE_KEYS are m_partner message keys.

/** Whole naira from what someone typed ("2,500" → 2500); null when it isn't a number. 0 is allowed (fees). */
export function nairaInput(text: string): number | null {
  const clean = text.replace(/[₦,\s]/g, "");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

/** "2500" → "2,500" for price boxes. */
export const priceText = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "" : Math.round(value).toLocaleString("en-NG"));

// ─── Coverage ────────────────────────────────────────────────────────────────────────────────────────────────────

/** States the chips show, in order, the busiest first (the rest follow alphabetically). */
const FIRST = ["Lagos", "Ogun", "Oyo", "Abia", "FCT", "Rivers", "Kano", "Enugu", "Edo", "Delta", "Kaduna", "Anambra"];
export const STATE_CHIPS: string[] = [...FIRST, ...NG_STATES.filter((state) => !FIRST.includes(state))];

/** How a state reads on a chip ("FCT" → "Abuja (FCT)"). */
export const stateLabel = (state: string) => (state === "FCT" ? "Abuja (FCT)" : state);

export type DeliverMode = "same" | "all" | "some";

/** Plain states among area tokens (regions, "State: Area" and Nationwide are kept aside). */
export function statesIn(areas: readonly string[]) {
  return areas.filter((area) => parseArea(area)?.kind === "state");
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item) => b.includes(item));

/** Which "Where can you deliver to?" choice the saved areas mean. */
export function deliverModeOf(pickupAreas: readonly string[], deliveryAreas: readonly string[]): DeliverMode {
  if (deliveryAreas.includes(NATIONWIDE)) return "all";
  if (!deliveryAreas.length) return "all";
  return sameSet(statesIn(pickupAreas), statesIn(deliveryAreas)) && deliveryAreas.every((area) => parseArea(area)?.kind === "state") ? "same" : "some";
}

/** The delivery areas to save for a choice; tokens the chips don't show (regions, "State: Area") are kept for "some". */
export function deliveryAreasFor(mode: DeliverMode, pickupStates: readonly string[], chosen: readonly string[], saved: readonly string[] = []) {
  if (mode === "all") return [NATIONWIDE];
  if (mode === "same") return cleanAreas([...pickupStates]).areas;
  const kept = saved.filter((area) => area !== NATIONWIDE && parseArea(area)?.kind !== "state");
  return cleanAreas([...chosen, ...kept]).areas;
}

/** Pickup areas to save: the chosen states plus any finer tokens already saved. */
export function pickupAreasFor(chosen: readonly string[], saved: readonly string[] = []) {
  const kept = saved.filter((area) => parseArea(area)?.kind !== "state");
  return cleanAreas([...chosen, ...kept]).areas;
}

// ─── Rate card ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A row while editing: the price is what was typed. */
export type DraftRate = Omit<RateRow, "price" | "id"> & { id: string; price: string };

let seq = 0;
const rowId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * "We started it from what you picked": one small-parcel row per pickup state for each service it offers, inside
 * that state (1–2 days, same-day in 0) and, when it delivers further, to everywhere else it covers (2–4 days).
 * Prices start empty for the partner to fill in.
 */
export function starterRates(pickupStates: readonly string[], deliverMode: DeliverMode, deliverStates: readonly string[], services: readonly string[]): DraftRate[] {
  const rows: DraftRate[] = [];
  const priced: RateService[] = (["doorstep", "pickup_point", "same_day"] as const).filter((service) => services.includes(service));
  if (!priced.length) priced.push("doorstep");
  const far = deliverMode === "all" ? [NATIONWIDE] : deliverMode === "some" ? deliverStates : [];
  for (const from of pickupStates.slice(0, 6)) {
    for (const service of priced) {
      rows.push({ id: rowId(), from, to: from, service, sizeBand: "small", price: "", minDays: service === "same_day" ? 0 : 1, maxDays: service === "same_day" ? 0 : 2 });
      if (service === "same_day") continue;
      for (const to of far.filter((place) => place !== from).slice(0, 6)) rows.push({ id: rowId(), from, to, service, sizeBand: "small", price: "", minDays: 2, maxDays: 4 });
    }
  }
  return rows;
}

export const draftFromRow = (row: RateRow): DraftRate => ({ ...row, price: priceText(row.price) });

/** Rows with a price, ready for PUT { section: "rates" } (rows left empty are skipped). */
export function rowsToSave(rows: readonly DraftRate[]) {
  return rows
    .map((row) => ({ id: row.id, from: row.from, to: row.to, service: row.service, sizeBand: row.sizeBand, price: nairaInput(row.price) ?? 0, minDays: row.minDays, maxDays: row.maxDays }))
    .filter((row) => row.price > 0);
}

export const newDraftRate = (from = "Lagos", to = "Lagos"): DraftRate => ({ id: rowId(), from, to, service: "doorstep", sizeBand: "small", price: "", minDays: 1, maxDays: 2 });

export const SIZE_KEYS: Record<SizeBand, string> = { small: "size.small", medium: "size.medium", bulky: "size.bulky" };
export const SERVICE_KEYS: Record<string, string> = { doorstep: "svc.doorstep", pickup_point: "svc.pickup_point", same_day: "svc.same_day", interstate: "svc.interstate" };

/**
 * The older onboarding call (PATCH /api/logistics/onboarding) still needs zone names, a vehicle and a delivery type
 * to mark set-up done. The first pickup states stand in for zones, at most 3: the free plan's coverage limit counts
 * them, and a 4th would refuse the whole set-up.
 */
export function legacyZonesFor(pickupStates: readonly string[]) {
  return pickupStates.length ? pickupStates.slice(0, 3) : ["Lagos"];
}
