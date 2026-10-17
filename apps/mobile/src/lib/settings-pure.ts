// Pure helpers for the seller's Payments, Delivery and Settings screens (app/payments.tsx, app/delivery.tsx,
// app/settings.tsx). No imports, so tests/mobile-settings.test.mjs loads this file directly.

// ─── Delivery areas (ShippingZone, the same rows the web's /home/shipping edits) ──────────────────────────────

export interface ZoneRate {
  name?: string;
  label?: string;
  price?: number | string;
  minValue?: number;
  maxValue?: number;
  min?: number;
  max?: number;
  freeOver?: number;
  [key: string]: unknown;
}

export interface Zone {
  id: string;
  name: string;
  regions: string[];
  rates: ZoneRate[];
  sortOrder: number;
  active: boolean;
}

/** "Ikeja, Yaba\nLekki" → ["Ikeja", "Yaba", "Lekki"], added to the list once each (any case), 80 letters max. */
export function addAreas(current: string[], text: string): string[] {
  const next = [...current];
  for (const part of text.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)) {
    const area = part.slice(0, 80);
    if (!next.some((item) => item.toLowerCase() === area.toLowerCase())) next.push(area);
  }
  return next.slice(0, 200);
}

/** A delivery fee from what someone typed ("1,500", "₦ 2000"); 0 is free delivery; null when it isn't a number. */
export function parseFee(text: string): number | null {
  const clean = text.replace(/[,₦\s]/g, "");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** The fee the phone edits: a zone with one price (or none yet). Zones with several prices are edited on the web. */
export function feeEditable(zone: Pick<Zone, "rates"> | null | undefined): boolean {
  return !zone || zone.rates.length <= 1;
}

/** The one price of a zone, as typed text ("" when there is none). */
export function feeText(zone: Pick<Zone, "rates"> | null | undefined): string {
  const price = zone?.rates[0]?.price;
  return price === undefined || price === null || price === "" ? "" : String(Number(price));
}

export type ZoneProblem = "needName" | "needFee";

export interface ZoneDraft {
  name: string;
  areas: string[];
  /** Area typed but not yet added with the button; saved too. */
  pendingArea: string;
  fee: string;
  active: boolean;
}

/** Why the zone can't be saved yet, or null. */
export function zoneProblem(draft: ZoneDraft, zone?: Pick<Zone, "rates"> | null): ZoneProblem | null {
  if (!draft.name.trim()) return "needName";
  if (feeEditable(zone) && parseFee(draft.fee) === null) return "needFee";
  return null;
}

/**
 * The body for POST /api/store/shipping-zones (new) or PATCH /api/store/shipping-zones/:id, built the way the web
 * form does: the price's other details (order limits, days, onboarding's mark) are kept; a zone with several
 * prices keeps them all untouched.
 */
export function zoneBody(draft: ZoneDraft, zone?: Pick<Zone, "rates"> | null) {
  const body: { name: string; regions: string[]; active: boolean; rates?: Record<string, unknown>[] } = {
    name: draft.name.trim().slice(0, 120),
    regions: addAreas(draft.areas, draft.pendingArea),
    active: draft.active,
  };
  if (feeEditable(zone)) {
    const { name, label, minValue, maxValue, min, max, price: _price, ...extra } = zone?.rates[0] ?? {};
    void _price;
    const lower = minValue ?? min;
    const upper = maxValue ?? max;
    body.rates = [
      {
        minWeight: 0,
        ...extra,
        name: (typeof name === "string" && name.trim()) || (typeof label === "string" && label.trim()) || "Standard delivery",
        minValue: lower != null && Number(lower) > 0 ? Number(lower) : 0,
        ...(upper != null && Number.isFinite(Number(upper)) ? { maxValue: Number(upper) } : {}),
        price: parseFee(draft.fee) ?? 0,
      },
    ];
  }
  return body;
}

/** "Ikeja · Yaba · Lekki +2" for a zone row; "" when it covers everywhere else. */
export function areasLine(regions: string[], shown = 3): string {
  if (!regions.length) return "";
  return regions.slice(0, shown).join(" · ") + (regions.length > shown ? ` +${regions.length - shown}` : "");
}

// ─── Payout bank ─────────────────────────────────────────────────────────────

/** Just the digits, at most 10 (what the account number box keeps). */
export function accountDigits(text: string): string {
  return text.replace(/\D/g, "").slice(0, 10);
}

/** Bank list filtered by what was typed ("gt" finds Guaranty Trust Bank (GTBank)). */
export function filterBanks(banks: string[], query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return banks;
  return banks.filter((bank) => words.every((word) => bank.toLowerCase().includes(word)));
}

// ─── Settings ────────────────────────────────────────────────────────────────

/** Only the fields that changed (trimmed), so saving one box never rewrites the others. */
export function changedFields<K extends string>(before: Record<K, string>, after: Record<K, string>): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of Object.keys(after) as K[]) {
    if ((after[key] ?? "").trim() !== (before[key] ?? "").trim()) out[key] = (after[key] ?? "").trim();
  }
  return out;
}
