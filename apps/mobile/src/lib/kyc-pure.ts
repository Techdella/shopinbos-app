// Delivery partner verification on the phone (tiered: shared/partner-tiers.ts): which step is where, the tier a
// partner will reach, the selfie and date checks. Pure, unit-tested in tests/mobile-partner-tiers.test.mjs.
import { ITEM_STEP, ONBOARDING_STEPS, type ItemState, type OnboardingStep } from "../../../../shared/partner-tiers.ts";
import type { Tone } from "./partner-pure.ts";

export type StepState = "done" | "pending" | "todo" | "rejected" | "optional";

export const KYC_STEPS = ONBOARDING_STEPS;

type Checklists = { tier1: Record<string, ItemState>; tier2: Record<string, ItemState> };

/** The items filled in on one step, with their state. */
export function stepItems(state: Checklists, step: OnboardingStep): Array<{ key: string; state: ItemState }> {
  const all = { ...state.tier1, ...state.tier2 };
  return Object.entries(all)
    .filter(([key]) => ITEM_STEP[key as keyof typeof ITEM_STEP] === step)
    .map(([key, value]) => ({ key, state: value }));
}

/** One step's state: anything rejected, then anything missing, then anything still being checked. CAC is optional. */
export function stepState(state: Checklists, step: OnboardingStep): StepState {
  if (step === "review") return "todo";
  const items = stepItems(state, step);
  if (step === "cac" && items.every((item) => item.state === "missing")) return "optional";
  if (items.some((item) => item.state === "rejected")) return "rejected";
  if (items.some((item) => item.state === "missing")) return "todo";
  if (items.some((item) => item.state === "pending")) return "pending";
  return "done";
}

/** Where to open the flow: the first Tier 1 step that still needs something, else Review. */
export function firstOpenStep(state: Checklists): OnboardingStep {
  for (const step of KYC_STEPS) {
    if (step === "cac" || step === "review") continue;
    if (stepItems({ tier1: state.tier1, tier2: {} }, step).some((item) => item.state === "missing" || item.state === "rejected")) return step;
  }
  return "review";
}

/** The tier sending now would reach once everything is checked: Tier 2 with all of CAC in, Tier 1 without, null when Tier 1 isn't ready. */
export function tierOnSubmit(state: Checklists): "tier1" | "tier2" | null {
  const ok = (value: ItemState) => value === "approved" || value === "pending";
  // Terms are accepted with the send itself, so they don't count here.
  if (!Object.entries(state.tier1).every(([key, value]) => key === "terms" || ok(value))) return null;
  return Object.values(state.tier2).every(ok) ? "tier2" : "tier1";
}

export const STEP_TONE: Record<StepState, Tone> = { done: "success", pending: "info", todo: "accent", rejected: "danger", optional: "muted" };
export const ITEM_TONE: Record<ItemState, Tone> = { approved: "success", pending: "info", missing: "muted", rejected: "danger" };

/** Largest selfie we send (base64 characters, about 1.1 MB of JPEG): bigger photos are retaken at lower quality. */
export const SELFIE_MAX_BASE64 = 1_500_000;

/** The selfie as the data URI the NIN check takes, or null when it's missing or too big to send. */
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

/** Only digits, at most `length` of them (NIN and BVN are 11, account numbers 10). */
export const digitsUpTo = (text: string, length: number) => text.replace(/\D/g, "").slice(0, length);

/** The Tier 1 items still missing or rejected, in checklist order (Review lists them). */
export function itemsWhereOpen(tier1: Record<string, ItemState>): Array<{ key: string; state: ItemState }> {
  return Object.entries(tier1)
    .filter(([, value]) => value === "missing" || value === "rejected")
    .map(([key, value]) => ({ key, state: value }));
}
