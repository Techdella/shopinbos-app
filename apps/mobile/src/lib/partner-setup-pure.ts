// A new delivery partner's short way in, on the phone: the 2-step set-up (/logistics/setup) and the "Finish later"
// list on Jobs, ordered like the tiers (shared/partner-tiers.ts): what taking jobs needs first, then what can wait.
// Pure, unit-tested in tests/partner-onboarding.test.mjs.
import { canonicalState, reachOf, type DeliverReach } from "../../../../shared/delivery-market.ts";
import { stepState, tierOnSubmit, type StepState } from "./kyc-pure.ts";
import type { ItemState, OnboardingStep } from "../../../../shared/partner-tiers.ts";

// ─── Set-up ──────────────────────────────────────────────────────────────────

/** Set-up's screens: 1 the business (name and home state), 2 how and where they deliver, then "ready". */
export type SetupStep = "biz" | "deliver" | "ready";
export const SETUP_QUESTIONS = 2;

/** Vehicles a partner picks on step 2 (shared/partner-tiers.ts DELIVERY_METHODS, "other" last). */
export const SETUP_VEHICLES = ["bike", "car", "van", "tricycle", "truck", "other"] as const;

/** The home state step 1 saved, or null before that (sign-up fills in "Lagos" for everyone, so it isn't an answer). */
export function savedHomeState(input: { onboardingState?: { source?: string } | null; city?: string | null; coverageZones?: readonly string[] }): string | null {
  if (input.onboardingState?.source !== "logistics-onboarding") return null;
  return canonicalState(input.coverageZones?.[0] ?? "") ?? canonicalState(input.city ?? "");
}

/**
 * Where set-up opens, so a partner who left half-way comes back to the step they stopped on: "ready" once set-up is
 * done, "deliver" once step 1 was saved, else "biz".
 */
export function setupStepOf(input: { onboarded: boolean; home: string | null }): SetupStep {
  if (input.onboarded) return "ready";
  return input.home ? "deliver" : "biz";
}

/** Step 2's answer from what's saved: where they deliver beyond their home state. */
export function savedReach(home: string | null, deliveryAreas: readonly string[] = []): { reach: DeliverReach; states: string[] } {
  if (!home || !deliveryAreas.length) return { reach: "home", states: [] };
  return reachOf(home, deliveryAreas);
}

/** Services from step 2: doorstep always, interstate when they go beyond their state. */
export function setupServices(reach: DeliverReach): string[] {
  return reach === "home" ? ["doorstep"] : ["doorstep", "interstate"];
}

/** Vehicles saved on the partner, without the "bike" sign-up puts on every new account before step 2 is answered. */
export function savedVehicles(input: { onboardingState?: { source?: string } | null; vehicleTypes?: readonly string[] }): string[] {
  if (input.onboardingState?.source !== "logistics-onboarding") return [];
  return (input.vehicleTypes ?? []).filter((type) => (SETUP_VEHICLES as readonly string[]).includes(type));
}

// ─── Finish later ────────────────────────────────────────────────────────────

type KycLike = { state: string; tier1: Record<string, ItemState>; tier2: Record<string, ItemState> };

/** One row of the list: a verification step, what it is now, and whether it can be done yet. */
export type LaterItem = { step: OnboardingStep; status: StepState | "locked" };

/** The steps that taking jobs needs (Tier 1), in the order the list asks for them. */
export const START_STEPS = ["identity", "bank", "vehicles", "guarantor"] as const satisfies readonly OnboardingStep[];

/**
 * "Finish later" on Jobs for a partner who isn't verified yet: first what taking jobs needs (ID and selfie, the bank
 * account fees are paid into, a vehicle, a guarantor; where they deliver only when set-up didn't fill it), then
 * "Send for checking" (open once those are in), then CAC for no order limits (Tier 2: open once Tier 1 is sent).
 * Null when the list has nothing to show: sent and waiting, verified, or on hold.
 */
export function finishLater(kyc: KycLike): { start: LaterItem[]; send: LaterItem; cac: LaterItem; done: number; total: number } | null {
  if (kyc.state !== "unverified" && kyc.state !== "rejected") return null;
  const steps: OnboardingStep[] = stepState(kyc, "coverage") === "done" ? [...START_STEPS] : ["identity", "bank", "vehicles", "coverage", "guarantor"];
  const start = steps.map((step) => ({ step, status: stepState(kyc, step) }));
  const ready = tierOnSubmit(kyc) !== null;
  const send: LaterItem = { step: "review", status: ready ? "todo" : "locked" };
  const cac: LaterItem = { step: "cac", status: "locked" };
  const done = start.filter((item) => item.status === "done" || item.status === "pending").length;
  return { start, send, cac, done, total: start.length + 1 };
}
