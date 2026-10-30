// "You have 20 credits to try Rex Studio": when a seller on the FREE plan finishes Rex's store build, their usable AI
// credits are topped up to REX_STUDIO_WELCOME_TARGET (once per seller, never reduced, nothing on paid plans), so they
// can try a video ad, product photos or a flyer straight away. Then honest nudges to use them: a card on the "is
// live" screen and Home with one-tap starters and a credits meter, and at most two reminders (day 1 and day 3) while
// they haven't made anything. When the credits run low the usual out-of-credits words show: on the web with a way to
// buy more, in the phone apps only that the plan's credits refill (shared/store-payments.ts).
//
// Pure, unit-tested in tests/rex-studio-welcome-credits.test.mjs; the grant and the reminders run in
// src/lib/ai/rex-studio-welcome.server.ts (one AiCreditGrant row per seller is the "already given" marker).

/** The AiCreditGrant reason and the AiCreditLot source of these credits. */
export const REX_STUDIO_WELCOME_REASON = "rex_studio_welcome";

/** The balance a free seller is topped up to after Rex builds their shop. */
export const REX_STUDIO_WELCOME_TARGET = 20;

/** How long the welcome credits last (a trial: used soon or gone, unlike bought credits' 12 months). */
export const REX_STUDIO_WELCOME_DAYS = 30;

/** Below this the meter says "running low" and the out-of-credits words show. */
export const REX_STUDIO_LOW_CREDITS = 5;

/** Days after the grant when a reminder may go (only while nothing was made yet). Two at most. */
export const REX_STUDIO_NUDGE_DAYS = [1, 3] as const;

/** How long the card stays on Home after the build. */
export const REX_STUDIO_CARD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The free plans (every role): the welcome credits and Peggy's free calls are theirs. */
export function isFreePlanKey(key: string | null | undefined) {
  return key === "seller_free" || key === "supplier_free" || key === "logistics_free";
}

/**
 * What Rex's build gives: a free SELLER who hasn't had it gets enough to reach the target (0 when they already have
 * that many, but the marker is still written so it never happens twice). Paid plans and other roles: nothing.
 */
export function rexStudioWelcomeGrant(input: { planKey: string | null | undefined; balance: number; alreadyGranted: boolean; target?: number }): { eligible: boolean; credits: number } {
  if (input.alreadyGranted || input.planKey !== "seller_free") return { eligible: false, credits: 0 };
  const target = input.target ?? REX_STUDIO_WELCOME_TARGET;
  const balance = Math.max(0, Math.floor(Number.isFinite(input.balance) ? input.balance : 0));
  return { eligible: true, credits: Math.max(0, target - balance) };
}

/** When a welcome lot made at `now` expires. */
export function rexStudioWelcomeExpiry(now: Date, days = REX_STUDIO_WELCOME_DAYS) {
  return new Date(now.getTime() + days * DAY_MS);
}

export type RexStudioMeterState = "plenty" | "low" | "out";

/** The credits meter: how full it is against the target (capped at 100%), and whether it's running low or out. */
export function rexStudioMeter(balance: number, target = REX_STUDIO_WELCOME_TARGET): { balance: number; target: number; percent: number; state: RexStudioMeterState } {
  const value = Math.max(0, Math.floor(Number.isFinite(balance) ? balance : 0));
  const percent = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const state: RexStudioMeterState = value <= 0 ? "out" : value < REX_STUDIO_LOW_CREDITS ? "low" : "plenty";
  return { balance: value, target, percent, state };
}

/**
 * Which reminder is due now (its index, 0 or 1), or null: only while they haven't made anything with Rex since the
 * grant, one at a time, in order, each from its day on, and never once the card's window is over.
 */
export function dueRexStudioNudge(input: { grantedAt: Date; nudgesSent: number; usedSinceGrant: boolean; now: Date }): number | null {
  if (input.usedSinceGrant) return null;
  const index = Math.max(0, Math.floor(input.nudgesSent));
  if (index >= REX_STUDIO_NUDGE_DAYS.length) return null;
  const age = input.now.getTime() - input.grantedAt.getTime();
  if (age > REX_STUDIO_CARD_DAYS * DAY_MS) return null;
  return age >= REX_STUDIO_NUDGE_DAYS[index] * DAY_MS ? index : null;
}

/** Whether the Rex Studio card shows (a welcome was recorded, recently). */
export function showRexStudioCard(grantedAt: Date | null | undefined, now: Date) {
  if (!grantedAt) return false;
  return now.getTime() - grantedAt.getTime() <= REX_STUDIO_CARD_DAYS * DAY_MS;
}

export type RexStudioStarterId = "video" | "photos" | "flyer";

/** The one-tap starters, in order. Their words (label and the prompt Rex gets) are the `credits` namespace's `rs.starter.*`. */
export const REX_STUDIO_STARTERS: readonly RexStudioStarterId[] = ["video", "photos", "flyer"];

/** A shop's product name, cleaned for a starter ("Make a 15s video of {product}"), or null. */
export function starterProduct(name: string | null | undefined) {
  const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return clean || null;
}

/** Where a starter opens: Rex Studio with the prompt filled in (web /studio?prompt=, phone /rex?prompt=). */
export function rexStudioStarterHref(prompt: string, surface: "web" | "app") {
  const text = prompt.trim().slice(0, 500);
  return surface === "web" ? `/studio?prompt=${encodeURIComponent(text)}` : `/rex?prompt=${encodeURIComponent(text)}`;
}
