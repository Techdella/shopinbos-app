import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { PLANS_BY_ROLE, PLAN_MARKERS, PLAN_NAMES, planKeyFor, type PlanRole } from "@shared/plans";

// Whether someone's paid tier was paid through Paystack, or is free time (PlanGrant: a referral welcome month, a
// milestone or an admin gift). Admin › Sellers and Admin › Logistics label plans with it; only a live subscription or
// a redeemed payment counts as paid, so a gifted tier never reads as money Paystack should have.

export type GrantInfo = { source: string; endsAt: Date };

export function paidMarkers(role: PlanRole) {
  return PLANS_BY_ROLE[role].filter((key) => key in PLAN_MARKERS).map((key) => PLAN_MARKERS[key as keyof typeof PLAN_MARKERS]);
}

export const PAID_THROUGH_PAYSTACK: Prisma.UserWhereInput = {
  OR: [{ planStatus: { in: ["active", "non_renewing"] } }, { paymentReceipts: { some: {} } }],
};

/** What planSource needs from User. */
export const PLAN_SOURCE_SELECT = { aiCredits: true, planStatus: true, _count: { select: { paymentReceipts: true } } } as const;

/** The free time running for each user (the latest-ending grant), so a gifted tier says where it came from. */
export async function runningGrants(userIds: string[], now: Date) {
  if (!userIds.length) return new Map<string, GrantInfo>();
  const rows = await db.planGrant
    .findMany({ where: { userId: { in: userIds }, endsAt: { gt: now } }, orderBy: { endsAt: "asc" }, select: { userId: true, source: true, endsAt: true } })
    .catch(() => []);
  return new Map<string, GrantInfo>(rows.map((row) => [row.userId, { source: row.source, endsAt: row.endsAt }]));
}

const GRANT_LABELS: Record<string, string> = { referral: "referral reward", referral_welcome: "referral welcome", milestone: "milestone reward", admin: "admin gift" };

/** The plan's name, whether it was paid through Paystack, and for free time where it came from and until when. */
export function planSource(role: PlanRole, user: { aiCredits: number; planStatus: string | null; _count: { paymentReceipts: number } } | null | undefined, grant: GrantInfo | undefined) {
  const marker = user?.aiCredits ?? null;
  const tiered = marker !== null && paidMarkers(role).includes(marker);
  const paidPlan = Boolean(tiered && user && (user.planStatus === "active" || user.planStatus === "non_renewing" || user._count.paymentReceipts > 0));
  const giftedPlan = tiered && !paidPlan;
  return {
    plan: PLAN_NAMES[planKeyFor(role, marker)],
    paidPlan,
    giftedPlan,
    giftNote: giftedPlan ? `Free · ${grant ? `${GRANT_LABELS[grant.source] ?? grant.source}, ends ${grant.endsAt.toISOString().slice(0, 10)}` : "not paid"}` : null,
  };
}
