// The seller's paid plan as Paystack reports it (src/app/api/webhooks/paystack/route.ts records it on User), and the
// "free domain with an annual plan" rule. Only a relative import, so tests/seller-plan.test.mjs runs it directly.

import { PLAN_TIERS, planTierOf, planVersion } from "../../shared/plan-catalog.ts";
//
// A domain is free only for sellers on an ANNUAL Growth or Pro plan that is active and paid up. The owner never
// pays for a domain year the seller hasn't paid for: a free renewal also needs the plan paid past the date the
// domain's next year starts (its current expiry). Everyone else pays for the domain yearly (src/lib/domains).

export type PlanInterval = "monthly" | "annual";
export type PlanStatus = "active" | "non_renewing" | "cancelled";

/** A plan code's billing interval: built-in codes and those created from Admin › Pricing › Plans (shared/plan-catalog.ts). */
export function planInterval(code: string | null | undefined): PlanInterval | null {
  return planVersion(code)?.billing ?? null;
}

/** The highest seller plan (Seller Pro, monthly or annual, at any price): the only one that can hide "Built with Shopinbos". */
export function isTopSellerPlan(code: string | null | undefined) {
  const tier = planTierOf(code);
  return Boolean(tier && PLAN_TIERS[tier].hideBadge);
}

/** The seller plans that come with a free domain: annual Growth or Pro, at any price. */
export function isFreeDomainPlan(code: string | null | undefined) {
  const version = planVersion(code);
  return Boolean(version && version.billing === "annual" && PLAN_TIERS[version.tier].freeDomainAnnual);
}

export interface SellerPlanState {
  planCode?: string | null;
  planInterval?: string | null;
  planStatus?: string | null;
  planPaidUntil?: Date | string | null;
}

function time(value: Date | string | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether the plan pays for the seller's domain: an active annual Growth or Pro plan, paid past now. For a renewal
 * pass `renewalStartsAt` (the domain's current expiry): the plan must already be paid up to at least that date.
 */
export function freeDomainEligible(user: SellerPlanState | null | undefined, now: Date, renewalStartsAt?: Date | string | null): boolean {
  if (!user) return false;
  if (user.planInterval !== "annual" || user.planStatus !== "active") return false;
  if (!isFreeDomainPlan(user.planCode)) return false;
  const paidUntil = time(user.planPaidUntil);
  if (paidUntil === null || paidUntil <= now.getTime()) return false;
  if (renewalStartsAt !== undefined) {
    const starts = time(renewalStartsAt);
    if (starts === null || paidUntil < starts) return false;
  }
  return true;
}

/** Paystack dates ("2027-10-14T09:00:00.000Z"); null when missing or unreadable. */
export function paystackDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** A paid invoice without a next payment date: one interval on from the later of the current paid-until and now. */
export function extendPaidUntil(current: Date | string | null | undefined, interval: PlanInterval, now: Date): Date {
  const base = new Date(Math.max(time(current) ?? 0, now.getTime()));
  if (interval === "annual") base.setUTCFullYear(base.getUTCFullYear() + 1);
  else base.setUTCMonth(base.getUTCMonth() + 1);
  return base;
}

/**
 * Whether an event about `eventSubscription` may change a user whose stored subscription is `stored`: always when
 * either is unknown, otherwise only the same subscription (a late event about an old, replaced plan is ignored).
 */
export function sameSubscription(stored: string | null | undefined, eventSubscription: string | null | undefined) {
  return !stored || !eventSubscription || stored === eventSubscription;
}
