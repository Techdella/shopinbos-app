import "server-only";

import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { addCredits } from "@/lib/ai/credits.server";
import { logDataAccess } from "@/lib/admin/data-access.server";
import { notify } from "@/lib/notifications/notify.server";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { applyGrantMarker, grantPlanMonths } from "@/lib/referrals/service.server";
import { mailT, memberLocale } from "@/lib/member-messaging/i18n";
import { PLAN_TIERS, type PlanTier } from "@shared/plan-catalog";
import { GRANT_TIER, asReferralRole, type ReferralRole } from "@shared/referrals";
import { GIFT_LIMITS, cleanGiftNote, giftPlanChoices, giftWindow } from "@shared/admin-gifts";

// Gifts from the Shopinbos team (Admin › Pricing › Gifts and free plans, /admin/pricing/gifts): free AI credits or
// free time on any paid plan of the person's role, and the join offer every new account gets (Admin › Pricing,
// "join.*"). Plan time is a PlanGrant (source "admin" or "join_offer") and works like referral free time: the
// account moves to the best plan its running grants give, and back to what it pays for, or Free, when they end
// (src/lib/referrals/service.server.ts applyGrantMarker, also run by the hourly referrals job). Credits are a
// 12-month lot. Every admin gift is written to the admin data access log (who, what, why) before it's given.

export class GiftError extends Error {}

const ROLE_LABEL: Record<ReferralRole, string> = { seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner" };
// Where each role sees its plan and credits.
const PLAN_PAGE: Record<ReferralRole, string> = { seller: "/home/settings", supplier: "/supplier/profile", logistics_partner: "/logistics/billing" };

async function giftee(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, preferences: true, planStatus: true, planPaidUntil: true, subscriptionCode: true },
  });
  const role = asReferralRole(user?.role);
  if (!user || !role) throw new GiftError("Gifts are for sellers, suppliers and delivery partners.");
  return { ...user, role };
}

/** Free AI credits (a 12-month lot), told to the person in their language. */
export async function giftCredits(input: { adminId: string; userId: string; credits: number; note: string }) {
  const credits = Math.round(input.credits);
  if (!Number.isFinite(credits) || credits < 1 || credits > GIFT_LIMITS.maxCredits) throw new GiftError(`Give between 1 and ${GIFT_LIMITS.maxCredits.toLocaleString("en-NG")} credits.`);
  const note = cleanGiftNote(input.note);
  if (!note) throw new GiftError("Say why (a few words), for the log.");
  const user = await giftee(input.userId);
  const reference = `admin-gift-${crypto.randomUUID()}`;
  await logDataAccess({ adminId: input.adminId, subjectUserId: user.id, action: "gift_credits", reason: "gift", note: `${credits.toLocaleString("en-NG")} AI credits · ${note}` });
  await addCredits(user.id, credits, "grant", reference);
  const t = mailT(memberLocale(user.preferences));
  await notify({
    userId: user.id,
    event: "gift.credits",
    category: "account",
    priority: "success",
    title: t("gift.credits.title", { count: credits.toLocaleString("en-NG") }),
    description: t("gift.credits.desc", { count: credits.toLocaleString("en-NG") }),
    link: PLAN_PAGE[user.role],
    dedupeKey: reference,
    email: true,
  }).catch(() => undefined);
  return { credits };
}

/**
 * Free time on a paid plan of the person's role, starting now (on top of any free time they have). A card
 * subscriber's plan is Paystack's to change, so it's refused for them.
 */
export async function giftPlan(input: { adminId: string; userId: string; tier: string; months: number; note: string }, now = new Date()) {
  const user = await giftee(input.userId);
  const tier = giftPlanChoices(user.role).find((choice) => choice.tier === input.tier)?.tier;
  if (!tier) throw new GiftError(`Pick one of the ${ROLE_LABEL[user.role].toLowerCase()} plans.`);
  const window = giftWindow(input.months, now);
  if (!window) throw new GiftError(`Give between 1 and ${GIFT_LIMITS.maxMonths} months.`);
  if (user.subscriptionCode && user.planStatus === "active" && user.planPaidUntil && user.planPaidUntil > now) {
    throw new GiftError("They pay for their plan by card, so Paystack decides their plan. Give AI credits instead, or ask them to cancel the card plan first.");
  }
  const note = cleanGiftNote(input.note);
  if (!note) throw new GiftError("Say why (a few words), for the log.");
  const plan = PLAN_TIERS[tier].label;
  const until = window.endsAt.toISOString().slice(0, 10);
  await logDataAccess({ adminId: input.adminId, subjectUserId: user.id, action: "gift_plan", reason: "gift", note: `${plan} until ${until} · ${note}` });
  const reference = `admin-plan-${crypto.randomUUID()}`;
  await db.planGrant.create({ data: { userId: user.id, tier, startsAt: window.startsAt, endsAt: window.endsAt, source: "admin", reference } });
  await applyGrantMarker(user.id, now);
  const t = mailT(memberLocale(user.preferences));
  await notify({
    userId: user.id,
    event: "gift.plan",
    category: "account",
    priority: "success",
    title: t("gift.plan.title", { plan }),
    description: t("gift.plan.desc", { plan, date: window.endsAt.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" }) }),
    link: PLAN_PAGE[user.role],
    dedupeKey: reference,
    email: true,
  }).catch(() => undefined);
  return { plan, endsAt: window.endsAt };
}

/** Ends free plan time a team member gave, now; the account goes back to what it pays for, or Free. */
export async function endPlanGift(input: { adminId: string; grantId: string; note: string }, now = new Date()) {
  const grant = await db.planGrant.findUnique({ where: { id: input.grantId } });
  if (!grant || grant.source !== "admin" || grant.endsAt <= now) throw new GiftError("That gift has already ended.");
  const note = cleanGiftNote(input.note);
  if (!note) throw new GiftError("Say why (a few words), for the log.");
  const plan = grant.tier in PLAN_TIERS ? PLAN_TIERS[grant.tier as PlanTier].label : grant.tier;
  await logDataAccess({ adminId: input.adminId, subjectUserId: grant.userId, action: "end_gift", reason: "gift", note: `${plan} ended early · ${note}` });
  await db.planGrant.update({ where: { id: grant.id }, data: { endsAt: grant.startsAt > now ? grant.startsAt : now } });
  await applyGrantMarker(grant.userId, now);
  return { userId: grant.userId };
}

/**
 * The join offer (Admin › Pricing, "join.*"): free months of the role's first paid plan for a brand-new account.
 * Once per account (its own reference), never throws.
 */
export async function giveJoinOffer(userId: string, role: string | null | undefined) {
  try {
    const giftRole = asReferralRole(role);
    if (!giftRole) return;
    const book = await getPriceBook();
    const months = Number(book[giftRole === "seller" ? "join.seller_months" : giftRole === "supplier" ? "join.supplier_months" : "join.logistics_months"]) || 0;
    if (months < 1) return;
    const given = await grantPlanMonths(userId, giftRole, months, "join_offer", `join-offer-${userId}`);
    if (!given.months) return;
    const user = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const t = mailT(memberLocale(user?.preferences));
    await notify({
      userId,
      event: "gift.join",
      category: "account",
      priority: "success",
      title: t("gift.join.title"),
      description: t("gift.join.desc", { gift: t("ref.welcome.months", { count: months, plan: PLAN_TIERS[GRANT_TIER[giftRole]].label }) }),
      link: PLAN_PAGE[giftRole],
      dedupeKey: `join-offer-${userId}`,
      email: true,
    }).catch(() => undefined);
  } catch (error) {
    console.error("[gifts] join offer", userId, error);
  }
}

export interface GiftPerson {
  id: string;
  name: string;
  email: string | null;
  role: ReferralRole;
  business: string | null;
  plan: string;
}

/** People a gift can go to, by name, email, phone or business name. */
export async function findGiftPeople(query: string, take = 20): Promise<GiftPerson[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const rows = await db.user.findMany({
    where: {
      role: { in: ["seller", "supplier", "logistics_partner"] },
      OR: [{ name: contains }, { email: contains }, { phone: { contains: q } }, { store: { name: contains } }, { supplier: { businessName: contains } }, { logisticsPartner: { displayName: contains } }],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, name: true, email: true, role: true, aiCredits: true, store: { select: { name: true } }, supplier: { select: { businessName: true } }, logisticsPartner: { select: { displayName: true } } },
  });
  return rows.flatMap((row) => {
    const role = asReferralRole(row.role);
    if (!role) return [];
    return [{ id: row.id, name: row.name, email: row.email, role, business: row.store?.name || row.supplier?.businessName || row.logisticsPartner?.displayName || null, plan: planName(role, row.aiCredits) }];
  });
}

function planName(role: ReferralRole, marker: number) {
  return giftPlanChoices(role).find((choice) => PLAN_TIERS[choice.tier].marker === marker)?.label ?? "Free";
}

/** One person's gift page: who they are, their plan and credits, and the free time running for them. */
export async function giftPerson(userId: string, now = new Date()) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, aiCredits: true, planStatus: true, planPaidUntil: true, subscriptionCode: true, store: { select: { name: true } }, supplier: { select: { businessName: true } }, logisticsPartner: { select: { displayName: true } } },
  });
  const role = asReferralRole(user?.role);
  if (!user || !role) return null;
  const [grants, account] = await Promise.all([
    db.planGrant.findMany({ where: { userId, endsAt: { gt: now } }, orderBy: { startsAt: "asc" } }),
    db.aiCreditAccount.findUnique({ where: { userId }, select: { balance: true, planCredits: true } }),
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    roleLabel: ROLE_LABEL[role],
    business: user.store?.name || user.supplier?.businessName || user.logisticsPartner?.displayName || null,
    plan: planName(role, user.aiCredits),
    paysByCard: Boolean(user.subscriptionCode && user.planStatus === "active" && user.planPaidUntil && user.planPaidUntil > now),
    credits: account ? account.balance + account.planCredits : null,
    grants: grants.map((grant) => ({ id: grant.id, plan: grant.tier in PLAN_TIERS ? PLAN_TIERS[grant.tier as PlanTier].label : grant.tier, source: grant.source, startsAt: grant.startsAt, endsAt: grant.endsAt })),
  };
}

/** The latest gifts the team gave (the access log's gift entries), with who gave them. */
export async function recentGifts(take = 50) {
  const rows = await db.adminDataAccess.findMany({ where: { action: { in: ["gift_credits", "gift_plan", "end_gift"] } }, orderBy: { createdAt: "desc" }, take }).catch(() => []);
  const ids = [...new Set(rows.flatMap((row) => [row.adminId, row.subjectUserId]))];
  const people = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, store: { select: { name: true } }, supplier: { select: { businessName: true } }, logisticsPartner: { select: { displayName: true } } } });
  const names = new Map(people.map((person) => [person.id, person.store?.name || person.supplier?.businessName || person.logisticsPartner?.displayName || person.name]));
  return rows.map((row) => ({ id: row.id, action: row.action, note: row.note, createdAt: row.createdAt, userId: row.subjectUserId, who: names.get(row.subjectUserId) ?? "A removed account", by: names.get(row.adminId) ?? "A removed team member" }));
}
