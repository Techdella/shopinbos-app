// "Talk to Peggy" voice calls: how many, how long, and what they cost (web, iOS and Android all follow this).
//
//   * Free plans (seller, supplier and delivery partner): FREE_PEGGY_CALLS_PER_MONTH (3) calls a month, counted by the
//     Lagos calendar month, each at most FREE_CALL_MAX_SECONDS (10 minutes). After those, a call costs AI credits:
//     PEGGY_CALL_MINUTE_CREDITS a started minute (Admin › Pricing "credits.cost.peggy_call_minute"; 10 by default,
//     the same as one picture: a minute of live voice AI costs us about what an image does). The call still lasts at
//     most 10 minutes.
//   * Paid plans keep what they had: no monthly cap, and the existing per-call maximum (PAID_CALL_MAX_SECONDS, 15
//     minutes) for every call.
//
// A paid call is held and settled, like a hotel card hold: the full 10 minutes are taken when it starts
// (peggyCallHold), the real length is read from ElevenLabs when it ends (the post-call webhook or the conversation
// API), and the minutes not used go straight back (settlePeggyCall). The cap itself is enforced by ElevenLabs:
// free-plan calls go to an agent whose max_duration_seconds is 600, so the line closes at 10:00 whatever the app
// does; the app also warns at 9:00 and ends tidily at 10:00 with a summary.
//
// Pure, unit-tested in tests/peggy-call-limits.test.mjs; the server side is src/lib/ai/peggy-voice.server.ts.

import { FREE_PEGGY_CALLS_PER_MONTH, peggyCallsLeft, type PlanKey } from "./plans.ts";

export { FREE_PEGGY_CALLS_PER_MONTH };

/** The longest call on a free plan (free or paid with credits). */
export const FREE_CALL_MAX_SECONDS = 600;
/** The longest call on a paid plan (the per-call cap every call had before). */
export const PAID_CALL_MAX_SECONDS = 900;
/** The "1 minute left" warning comes this long before the end. */
export const CALL_WARNING_SECONDS = 60;
/** A call shorter than this (a line that never really opened) costs nothing. */
export const CALL_GRACE_SECONDS = 10;
/** Credits per started minute after the free calls (the default; Admin › Pricing can change it). */
export const PEGGY_CALL_MINUTE_CREDITS = 10;

/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** The Lagos calendar month `now` falls in ("2026-10"). */
export function lagosMonth(now: Date) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The instant this Lagos month began (midnight on the 1st in Lagos, i.e. 23:00 UTC the day before). */
export function lagosMonthStart(now: Date) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - LAGOS_OFFSET_MS);
}

export type PeggyCallMode = "plan" | "free" | "credits";

export interface PeggyCallTerms {
  /** plan: a paid plan's call · free: one of the month's free calls · credits: paid with AI credits. */
  mode: PeggyCallMode;
  /** The most the call can last (the agent ends it here). */
  maxSeconds: number;
  /** Free calls left this month after this one starts (null on paid plans). */
  callsLeft: number | null;
  /** Credits per started minute (credits mode; 0 otherwise). */
  perMinute: number;
  /** Credits taken when it starts (credits mode; 0 otherwise). */
  hold: number;
}

/** The credits held for a call: every minute it could last. */
export function peggyCallHold(perMinute: number, maxSeconds = FREE_CALL_MAX_SECONDS) {
  return Math.max(0, Math.round(perMinute)) * Math.ceil(Math.max(0, maxSeconds) / 60);
}

/** The longest call a plan allows. */
export function callMaxSeconds(planKey: PlanKey | string) {
  return peggyCallsLeft(planKey as PlanKey, 0) === null ? PAID_CALL_MAX_SECONDS : FREE_CALL_MAX_SECONDS;
}

/**
 * The terms of the next call: paid plans as before; a free plan's first three calls of the Lagos month are free;
 * after that each call is paid in credits, held for the full 10 minutes.
 */
export function peggyCallTerms(input: { planKey: PlanKey | string; usedThisMonth: number; perMinute?: number }): PeggyCallTerms {
  const left = peggyCallsLeft(input.planKey as PlanKey, Math.max(0, input.usedThisMonth));
  if (left === null) return { mode: "plan", maxSeconds: PAID_CALL_MAX_SECONDS, callsLeft: null, perMinute: 0, hold: 0 };
  if (left > 0) return { mode: "free", maxSeconds: FREE_CALL_MAX_SECONDS, callsLeft: left - 1, perMinute: 0, hold: 0 };
  const perMinute = Math.max(1, Math.round(input.perMinute ?? PEGGY_CALL_MINUTE_CREDITS));
  return { mode: "credits", maxSeconds: FREE_CALL_MAX_SECONDS, callsLeft: 0, perMinute, hold: peggyCallHold(perMinute, FREE_CALL_MAX_SECONDS) };
}

/** Started minutes billed for a call of `seconds` (never past the cap; a line that never opened is 0). */
export function billableMinutes(seconds: number, maxSeconds = FREE_CALL_MAX_SECONDS) {
  const length = Math.min(Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)), maxSeconds);
  if (length < CALL_GRACE_SECONDS) return 0;
  return Math.ceil(length / 60);
}

/**
 * Settling a held call: what it really cost (started minutes × the minute price, never more than was held) and
 * what goes back. charge + refund always equals the hold.
 */
export function settlePeggyCall(input: { held: number; perMinute: number; seconds: number; maxSeconds?: number }): { minutes: number; charge: number; refund: number } {
  const held = Math.max(0, Math.round(input.held));
  const minutes = billableMinutes(input.seconds, input.maxSeconds ?? FREE_CALL_MAX_SECONDS);
  const charge = Math.min(held, minutes * Math.max(0, Math.round(input.perMinute)));
  return { minutes, charge, refund: held - charge };
}

/** When the app warns and when it ends the call (seconds from when it connected). */
export function callTimeline(maxSeconds: number) {
  const endAt = Math.max(0, Math.round(maxSeconds));
  return { warnAt: Math.max(0, endAt - CALL_WARNING_SECONDS), endAt };
}

/** Where a call is against its cap: carry on, "1 minute left", or time's up. */
export function callPhaseAt(elapsedSeconds: number, maxSeconds: number): "ok" | "warning" | "over" {
  const { warnAt, endAt } = callTimeline(maxSeconds);
  if (elapsedSeconds >= endAt) return "over";
  if (elapsedSeconds >= warnAt) return "warning";
  return "ok";
}

/**
 * What the app tells Peggy (an ElevenLabs contextual update, not read out) a minute before the end, so she wraps up
 * herself: a gentle "one minute left" and a short summary of what they covered.
 */
export const ONE_MINUTE_LEFT_NOTE =
  "There is one minute left on this call. Gently tell them there's about a minute left, then sum up in two or three short sentences what you covered and what they should do next, and say goodbye. Don't start anything new.";
