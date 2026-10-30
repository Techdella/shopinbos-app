// Gifts from the Shopinbos team (Admin › Pricing › Gifts and free plans; src/lib/admin/gifts.server.ts): the limits,
// the plans a person can be given, and the free-time window. Pure, unit-tested in tests/admin-gifts.test.mjs.

import { PLAN_TIERS, type PlanTier } from "./plan-catalog.ts";

export const GIFT_LIMITS = { maxCredits: 100_000, maxMonths: 12, noteMax: 300 } as const;

type GiftRole = "seller" | "supplier" | "logistics_partner";

/** The paid plans of a role, cheapest first (what a team member can give). */
export function giftPlanChoices(role: GiftRole): Array<{ tier: PlanTier; label: string }> {
  return (Object.keys(PLAN_TIERS) as PlanTier[])
    .filter((tier) => PLAN_TIERS[tier].role === role)
    .sort((a, b) => PLAN_TIERS[a].marker - PLAN_TIERS[b].marker)
    .map((tier) => ({ tier, label: PLAN_TIERS[tier].label }));
}

/** From now for `months` whole months (1 to 12), or null. */
export function giftWindow(months: number, now = new Date()): { startsAt: Date; endsAt: Date } | null {
  if (!Number.isInteger(months) || months < 1 || months > GIFT_LIMITS.maxMonths) return null;
  const endsAt = new Date(now);
  endsAt.setUTCMonth(endsAt.getUTCMonth() + months);
  return { startsAt: new Date(now), endsAt };
}

/** The reason for the log, trimmed; empty when it's too short to mean anything. */
export function cleanGiftNote(raw: unknown): string {
  const note = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, GIFT_LIMITS.noteMax);
  return note.length >= 3 ? note : "";
}
