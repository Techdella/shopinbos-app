// Delivery partner sign-up on the phone (one question per screen: shared/partner-tiers.ts PARTNER_FLOW): where to
// open, the screen order, and the selfie, NIN and date checks. Pure, unit-tested in tests/mobile-partner-tiers.test.mjs.
import { PARTNER_FLOW, isFlowScreen, type FlowScreen, type ItemState } from "../../../../shared/partner-tiers.ts";
import type { Tone } from "./partner-pure.ts";

/** Step names older links used (the earlier 4-step flow) → the screen that asks for it now. */
const OLD_STEPS: Record<string, FlowScreen> = { identity: "id", bank: "review", delivery: "areas", coverage: "areas", vehicles: "vehicles", guarantor: "review" };

/** The screen to open: the one asked for (?step=…), else the first unanswered one the server worked out. */
export function openScreen(first: FlowScreen, asked?: string | null): FlowScreen {
  if (isFlowScreen(asked)) return asked;
  return (asked && OLD_STEPS[asked]) || first;
}

export const nextScreen = (screen: FlowScreen): FlowScreen => PARTNER_FLOW[Math.min(PARTNER_FLOW.indexOf(screen) + 1, PARTNER_FLOW.length - 1)];
export const previousScreen = (screen: FlowScreen): FlowScreen | null => (PARTNER_FLOW.indexOf(screen) > 0 ? PARTNER_FLOW[PARTNER_FLOW.indexOf(screen) - 1] : null);
/** "3 of 11". */
export const screenNumber = (screen: FlowScreen) => ({ step: PARTNER_FLOW.indexOf(screen) + 1, total: PARTNER_FLOW.length });

/** "Lagos: Ikeja" (an LGA in the state) or "Lagos" (all of it): the marketplace's area tokens. */
export const areaToken = (state: string, lga?: string | null) => (lga ? `${state}: ${lga}` : state);

/** Fee per delivery typed as "₦2,500" or "2500": whole naira from 100, else null. */
export function feeAmount(text: string): number | null {
  const amount = Number(String(text).replace(/[₦,\s]/g, ""));
  return Number.isFinite(amount) && amount >= 100 && amount <= 1_000_000 ? Math.round(amount) : null;
}

export const ITEM_TONE: Record<ItemState, Tone> = { approved: "success", pending: "info", missing: "muted", rejected: "danger" };

/** Largest photo we send (base64 characters, about 1.1 MB of JPEG): bigger photos are retaken at lower quality. */
export const SELFIE_MAX_BASE64 = 1_500_000;

/** A photo (selfie, ID, base) as the data URI the kyc routes take, or null when it's missing or too big to send. */
export function selfieDataUri(base64: string | null | undefined, mimeType?: string | null): string | null {
  if (!base64 || base64.length > SELFIE_MAX_BASE64) return null;
  const type = mimeType === "image/png" ? "image/png" : "image/jpeg";
  return `data:${type};base64,${base64}`;
}

/** A typed date of birth ("14/02/1990", "14-2-1990" or "1990-02-14") as YYYY-MM-DD, or null when it isn't a real date. */
export function birthDate(text: string, now = new Date()): string | null {
  const value = text.trim();
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const age = now.getUTCFullYear() - year;
  if (age < 16 || age > 100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Only digits, at most `length` of them (NIN 11, account numbers 10). */
export const digitsUpTo = (text: string, length: number) => text.replace(/\D/g, "").slice(0, length);

/** The Tier 1 items still missing or rejected, in checklist order (the review screen lists them). */
export function itemsWhereOpen(tier1: Record<string, ItemState>): Array<{ key: string; state: ItemState }> {
  return Object.entries(tier1)
    .filter(([, value]) => value === "missing" || value === "rejected")
    .map(([key, value]) => ({ key, state: value }));
}
