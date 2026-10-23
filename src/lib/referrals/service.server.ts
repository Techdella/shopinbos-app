import "server-only";

import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { addCredits } from "@/lib/ai/credits.server";
import { giftFeaturedWeeks } from "@/lib/plans/extras.server";
import { notify } from "@/lib/notifications/notify.server";
import { FREE_PLAN_MARKER, PLAN_TIERS, type PlanTier } from "@shared/plan-catalog";
import { planKeyFor } from "@shared/plans";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import {
  GRANT_TIER,
  REFERRAL_COOKIE,
  REFERRAL_LIMITS,
  REFERRAL_OFFERS,
  asReferralRole,
  asRewardChoice,
  cleanReferralCode,
  extendGrant,
  makeReferralCode,
  milestoneAt,
  progressText,
  qualifies,
  referrerReward,
  rewardText,
  selfReferralReasons,
  underYearlyCap,
  welcomeText,
  type QualifyFacts,
  type ReferralRole,
  type RewardChoice,
} from "@shared/referrals";
import { sendReferralWhatsApp } from "./whatsapp.server";

// Refer & earn (shared/referrals.ts has the offers and rules). The flow:
//  1. /r/CODE sets the sib_ref cookie and shows the invite page.
//  2. After sign-up (/api/auth/sync-user, /auth/callback) claimReferralFromCookie() links the new account to the
//     code, gives the welcome gift and tells the referrer.
//  3. The hourly referrals job (/api/cron/referrals) checks who now counts, rewards the referrer (months or credits,
//     their choice; credits when they pay by card), gives milestone bonuses and ends free plan time that's over.
// Every gift has its own reference, so a retry never gives twice.

const DAY = 86_400_000;

function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

/** Business name to show: the shop, supplier or partner name, else the person's name. */
async function businessNames(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, store: { select: { name: true } }, supplier: { select: { businessName: true } }, logisticsPartner: { select: { displayName: true } } },
  });
  return new Map(users.map((user) => [user.id, user.store?.name || user.supplier?.businessName || user.logisticsPartner?.displayName || user.name || "A business"]));
}

// ─── Codes ────────────────────────────────────────────────────────────────────

/** This person's invite code, made the first time they ask. */
export async function referralCodeFor(userId: string) {
  const existing = await db.referralCode.findUnique({ where: { userId } });
  if (existing) return existing;
  const name = (await businessNames([userId])).get(userId);
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await db.referralCode.create({ data: { code: makeReferralCode(name), userId } });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const mine = await db.referralCode.findUnique({ where: { userId } });
      if (mine) return mine;
    }
  }
  throw new Error("Couldn't make an invite code. Try again.");
}

export async function setRewardChoice(userId: string, choice: RewardChoice) {
  const code = await referralCodeFor(userId);
  await db.referralCode.update({ where: { code: code.code }, data: { rewardChoice: asRewardChoice(choice) } });
}

/** The inviter behind a code, for the public invite page. */
export async function inviterFor(rawCode: string) {
  const code = cleanReferralCode(rawCode);
  if (!code) return null;
  const row = await db.referralCode.findUnique({ where: { code } });
  if (!row) return null;
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, role: true, verificationStatus: true } });
  if (!user || user.role === "admin" || user.verificationStatus === "suspended") return null;
  return { code, name: (await businessNames([user.id])).get(user.id) ?? "A business", role: asReferralRole(user.role) };
}

// ─── Free plan time ───────────────────────────────────────────────────────────

/** Paying by card right now (an active Paystack subscription): free months can't be added on top. */
function isPaying(user: { planStatus: string | null; planPaidUntil: Date | null; subscriptionCode: string | null }, now = new Date()) {
  return Boolean(user.subscriptionCode && user.planStatus === "active" && user.planPaidUntil && user.planPaidUntil > now);
}

/**
 * Adds free months on the role's first paid plan, after any free time already running (max 12 months ahead). Puts
 * the account on that plan now unless it's on a paid one already. Returns the months actually added (0 when full).
 */
export async function grantPlanMonths(userId: string, role: ReferralRole, months: number, source: string, reference: string, now = new Date()) {
  if (months <= 0) return { months: 0, endsAt: null as Date | null };
  const done = await db.planGrant.findUnique({ where: { reference } });
  if (done) return { months, endsAt: done.endsAt };
  const latest = await db.planGrant.findFirst({ where: { userId, endsAt: { gt: now } }, orderBy: { endsAt: "desc" } });
  const window = extendGrant(latest?.endsAt ?? null, months, now);
  if (!window) return { months: 0, endsAt: latest?.endsAt ?? null };
  const tier = GRANT_TIER[role];
  try {
    await db.planGrant.create({ data: { userId, tier, startsAt: window.startsAt, endsAt: window.endsAt, source, reference } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
  }
  await applyGrantMarker(userId, now);
  return { months, endsAt: window.endsAt };
}

/** Puts one account on its free plan while a grant runs, and back on the free plan when it's over. */
async function applyGrantMarker(userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, aiCredits: true, planStatus: true, planPaidUntil: true, subscriptionCode: true } });
  if (!user || isPaying(user, now)) return;
  const current = planKeyFor(user.role, user.aiCredits);
  const running = await db.planGrant.findFirst({ where: { userId, startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: "desc" } });
  if (running && running.tier in PLAN_TIERS) {
    const marker = PLAN_TIERS[running.tier as PlanTier].marker;
    // Never step someone down from a better plan they already have.
    if (current.endsWith("_free") && user.aiCredits !== marker) await db.user.update({ where: { id: userId }, data: { aiCredits: marker } });
    return;
  }
  // No grant running: only undo a plan that came from a grant, never one they paid for (a card subscription paid up,
  // or a one-off plan payment made since the free time began).
  if (current.endsWith("_free") || (user.planPaidUntil && user.planPaidUntil > now)) return;
  const granted = await db.planGrant.findFirst({ where: { userId, tier: current }, orderBy: { startsAt: "asc" } });
  if (!granted) return;
  const paid = await db.paymentReceipt.count({ where: { userId, purpose: current, createdAt: { gte: granted.startsAt } } });
  if (!paid) await db.user.update({ where: { id: userId }, data: { aiCredits: FREE_PLAN_MARKER } });
}

/** The hourly sweep: grants that just started or ended (a cancelled card subscription during a grant, too). */
export async function sweepPlanGrants(now = new Date()) {
  const recent = await db.planGrant.findMany({
    where: { OR: [{ endsAt: { gt: new Date(now.getTime() - 7 * DAY), lte: now } }, { startsAt: { lte: now }, endsAt: { gt: now } }] },
    select: { userId: true },
    distinct: ["userId"],
    take: 2000,
  });
  for (const { userId } of recent) await applyGrantMarker(userId, now).catch((error) => console.error("[referrals] grant sweep", userId, error));
  return recent.length;
}

/** Free plan time running now or later, for the billing and refer pages. */
export async function freePlanUntil(userId: string, now = new Date()) {
  const latest = await db.planGrant.findFirst({ where: { userId, endsAt: { gt: now } }, orderBy: { endsAt: "desc" } });
  return latest ? { tier: latest.tier, endsAt: latest.endsAt } : null;
}

// ─── Joining with a code ──────────────────────────────────────────────────────

/** Reads the referral cookie after sign-up and links the account (once). Never throws. */
export async function claimReferralFromCookie(userId: string) {
  try {
    const jar = await cookies();
    const code = jar.get(REFERRAL_COOKIE)?.value;
    if (!code) return null;
    const result = await attributeReferral(userId, code);
    if (result.ok || result.final) jar.delete(REFERRAL_COOKIE);
    return result;
  } catch (error) {
    console.error("[referrals] claim failed", error);
    return null;
  }
}

type AttributeResult = { ok: true; referralId: string } | { ok: false; final: boolean; reason: string };

/** Links a new account to an invite code and gives the welcome gift. `final` false: try again later. */
export async function attributeReferral(userId: string, rawCode: string, now = new Date()): Promise<AttributeResult> {
  const code = cleanReferralCode(rawCode);
  if (!code) return { ok: false, final: true, reason: "Not a code" };
  const [row, referee, existing] = await Promise.all([
    db.referralCode.findUnique({ where: { code } }),
    db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, email: true, phone: true, createdAt: true } }),
    db.referral.findUnique({ where: { refereeId: userId } }),
  ]);
  if (existing) return { ok: false, final: true, reason: "Already linked" };
  if (!row || !referee) return { ok: false, final: true, reason: "Unknown code" };
  const role = asReferralRole(referee.role);
  if (!role) return { ok: false, final: true, reason: "Only businesses can be invited" };
  if (now.getTime() - referee.createdAt.getTime() > REFERRAL_LIMITS.attributeWithinDays * DAY) return { ok: false, final: true, reason: "Account is older than the invite" };
  const referrer = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, role: true, name: true, email: true, phone: true } });
  if (!referrer) return { ok: false, final: true, reason: "Inviter is gone" };
  const same = selfReferralReasons(referrer, referee);

  let referral;
  try {
    referral = await db.referral.create({
      data: { code, referrerId: referrer.id, refereeId: referee.id, refereeRole: role, ...(same.length ? { status: "rejected", reason: same.join(", ") } : {}) },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, final: true, reason: "Already linked" };
    throw error;
  }
  if (same.length) return { ok: false, final: true, reason: same.join(", ") };

  const welcome = await giveWelcome(referee.id, role, referral.id, now).catch((error) => {
    console.error("[referrals] welcome gift failed", error);
    return null;
  });
  const names = await businessNames([referrer.id, referee.id]);
  const offer = REFERRAL_OFFERS[role];

  await notify({
    userId: referee.id,
    event: "referral.welcome",
    category: "account",
    priority: "success",
    title: `Welcome gift from ${names.get(referrer.id)}`,
    description: `${names.get(referrer.id)} invited you, so you've got ${welcomeText(role)}.`,
    link: "/refer",
    dedupeKey: `referral-welcome-${referral.id}`,
    email: true,
  }).catch(() => undefined);
  await notify({
    userId: referrer.id,
    event: "referral.joined",
    category: "account",
    priority: "success",
    title: `${names.get(referee.id)} joined with your invite`,
    description: `Your reward comes when this counts: ${offer.rule.toLowerCase()}.`,
    link: "/refer",
    dedupeKey: `referral-joined-${referral.id}`,
    email: true,
    phoneHandled: true,
  }).catch(() => undefined);
  await sendReferralWhatsApp("joined", referrer.phone, [firstName(referrer.name), names.get(referee.id) ?? "A business", offer.rule.toLowerCase()]);
  if (welcome) await sendReferralWhatsApp("welcome", referee.phone, [firstName(referee.name), names.get(referrer.id) ?? "A friend", welcomeText(role)]);
  return { ok: true, referralId: referral.id };
}

async function giveWelcome(userId: string, role: ReferralRole, referralId: string, now: Date) {
  const offer = REFERRAL_OFFERS[role];
  const given: Record<string, unknown> = {};
  if (offer.welcomeMonths) given.months = (await grantPlanMonths(userId, role, offer.welcomeMonths, "referral_welcome", `referral-welcome-${referralId}`, now)).months;
  if (offer.welcomeCredits) {
    await addCredits(userId, offer.welcomeCredits, "grant", `referral-welcome-${referralId}`);
    given.credits = offer.welcomeCredits;
  }
  if (offer.welcomeFeaturedWeeks) {
    await giftFeaturedWeeks(userId, offer.welcomeFeaturedWeeks, `referral-${referralId}`);
    given.featuredWeeks = offer.welcomeFeaturedWeeks;
  }
  await db.referral.update({ where: { id: referralId }, data: { welcomeReward: given as Prisma.InputJsonValue } });
  return given;
}

// ─── Counting and rewarding ───────────────────────────────────────────────────

async function factsFor(userId: string, role: ReferralRole): Promise<QualifyFacts> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { verificationStatus: true } });
  const facts: QualifyFacts = { verified: false, suspended: user?.verificationStatus === "suspended", approvedProducts: 0, liveShop: false, paidOrders: 0, completedDeliveries: 0 };
  if (role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId }, select: { id: true, verificationStatus: true, status: true } });
    if (supplier) {
      facts.verified = supplier.verificationStatus === "verified";
      facts.suspended ||= supplier.verificationStatus === "suspended" || supplier.status === "suspended";
      facts.approvedProducts = await db.supplierProduct.count({ where: { supplierId: supplier.id, status: "published" } });
    }
  } else if (role === "seller") {
    const store = await db.store.findUnique({ where: { userId }, select: { id: true, status: true } });
    if (store) {
      const [pages, orders] = await Promise.all([
        db.storePage.count({ where: { storeId: store.id, isPublished: true } }),
        db.retailOrder.count({ where: { storeId: store.id, status: { in: [...PAID_ORDER_STATUSES] } } }),
      ]);
      facts.liveShop = pages > 0 && store.status !== "suspended";
      facts.paidOrders = orders;
    }
  } else {
    const partner = await db.logisticsPartner.findUnique({ where: { userId }, select: { id: true, verificationStatus: true, status: true } });
    if (partner) {
      facts.verified = partner.verificationStatus === "verified";
      facts.suspended ||= partner.verificationStatus === "suspended" || partner.status === "suspended";
      facts.completedDeliveries = await db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "delivered" } });
    }
  }
  return facts;
}

/** Rewards a referral that now counts: the referrer's reward, then any milestone. Safe to call twice. */
async function rewardReferral(referralId: string, now = new Date()) {
  // Claim it: only one run moves it from signed_up.
  const claimed = await db.referral.updateMany({ where: { id: referralId, status: "signed_up" }, data: { status: "qualified", qualifiedAt: now } });
  if (!claimed.count) return false;
  const referral = await db.referral.findUniqueOrThrow({ where: { id: referralId } });
  const role = asReferralRole(referral.refereeRole)!;
  const referrer = await db.user.findUnique({ where: { id: referral.referrerId }, select: { id: true, name: true, phone: true, role: true, planStatus: true, planPaidUntil: true, subscriptionCode: true } });
  const referrerRole = asReferralRole(referrer?.role);
  if (!referrer || !referrerRole) {
    await db.referral.update({ where: { id: referralId }, data: { status: "rejected", reason: "The inviter's account can't get rewards" } });
    return false;
  }
  const rewardedLastYear = await db.referral.count({ where: { referrerId: referrer.id, status: "rewarded", rewardedAt: { gte: new Date(now.getTime() - 365 * DAY) } } });
  if (!underYearlyCap(rewardedLastYear)) {
    await db.referral.update({ where: { id: referralId }, data: { status: "rejected", reason: `Over ${REFERRAL_LIMITS.rewardsPerYear} rewards in 12 months` } });
    return false;
  }

  const choice = asRewardChoice((await db.referralCode.findUnique({ where: { userId: referrer.id } }))?.rewardChoice);
  const paying = isPaying(referrer, now);
  const planned = referrerReward(REFERRAL_OFFERS[role], choice, paying);
  const given = await giveReward(referrer.id, referrerRole, planned, `referral-${referralId}`, now);
  await db.referral.update({ where: { id: referralId }, data: { status: "rewarded", rewardedAt: now, referrerReward: { ...given, paying } as Prisma.InputJsonValue } });

  const names = await businessNames([referral.refereeId]);
  const friend = names.get(referral.refereeId) ?? "Your invite";
  await notify({
    userId: referrer.id,
    event: "referral.rewarded",
    category: "account",
    priority: "success",
    title: `Your reward: ${rewardText(given)}`,
    description: `${friend} now counts on Shopinbos, so you've got ${rewardText(given)}. Thank you for inviting them!`,
    link: "/refer",
    dedupeKey: `referral-reward-${referralId}`,
    email: true,
    phoneHandled: true,
  }).catch(() => undefined);
  await sendReferralWhatsApp("reward", referrer.phone, [firstName(referrer.name), friend, rewardText(given)]);

  // Milestones count rewarded referrals; each is given once (its own reference).
  const total = await db.referral.count({ where: { referrerId: referrer.id, status: "rewarded" } });
  const milestone = milestoneAt(total);
  if (milestone && (milestone.bonusMonths || milestone.bonusCredits)) {
    const bonus = await giveReward(referrer.id, referrerRole, paying || choice === "credits" ? { months: 0, credits: milestone.bonusCredits } : { months: milestone.bonusMonths, credits: 0 }, `milestone-${referrer.id}-${milestone.count}`, now);
    await notify({
      userId: referrer.id,
      event: "referral.milestone",
      category: "account",
      priority: "success",
      title: `${milestone.count} businesses joined with your invite!`,
      description: `Here's a thank-you: ${rewardText(bonus)}.`,
      link: "/refer",
      dedupeKey: `referral-milestone-${referrer.id}-${milestone.count}`,
      email: true,
    }).catch(() => undefined);
  }
  return true;
}

async function giveReward(userId: string, role: ReferralRole, reward: { months: number; credits: number }, reference: string, now: Date) {
  let months = 0;
  let credits = reward.credits;
  if (reward.months) {
    months = (await grantPlanMonths(userId, role, reward.months, reference.startsWith("milestone") ? "milestone" : "referral", reference, now)).months;
    // No room for more free months (12 already ahead): credits instead.
    if (!months) credits = REFERRAL_OFFERS[role].referrerCredits;
  }
  if (credits) await addCredits(userId, credits, "grant", reference);
  return { months, credits };
}

/** The hourly job: referrals that now count get rewarded; old ones that never counted are closed. */
export async function runReferralJob(now = new Date()) {
  const open = await db.referral.findMany({ where: { status: "signed_up" }, orderBy: { createdAt: "asc" }, take: 500 });
  let rewarded = 0;
  let expired = 0;
  for (const referral of open) {
    const role = asReferralRole(referral.refereeRole);
    if (!role) continue;
    try {
      if (qualifies(role, await factsFor(referral.refereeId, role))) {
        if (await rewardReferral(referral.id, now)) rewarded++;
      } else if (now.getTime() - referral.createdAt.getTime() > REFERRAL_LIMITS.qualifyWithinDays * DAY) {
        await db.referral.update({ where: { id: referral.id }, data: { status: "rejected", reason: `Didn't count within ${REFERRAL_LIMITS.qualifyWithinDays} days` } });
        expired++;
      }
    } catch (error) {
      console.error("[referrals] check failed", referral.id, error);
    }
  }
  const grants = await sweepPlanGrants(now);
  return { checked: open.length, rewarded, expired, grants };
}

// ─── Pages ────────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { signed_up: "Joined", qualified: "Counting…", rewarded: "Rewarded", rejected: "Didn't count" };

/** Everything the Refer & earn page shows. */
export async function referralOverview(userId: string) {
  const [code, user, rows, free] = await Promise.all([
    referralCodeFor(userId),
    db.user.findUnique({ where: { id: userId }, select: { role: true, planStatus: true, planPaidUntil: true, subscriptionCode: true } }),
    db.referral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    freePlanUntil(userId),
  ]);
  const names = await businessNames(rows.map((row) => row.refereeId));
  const list = await Promise.all(
    rows.map(async (row) => {
      const role = asReferralRole(row.refereeRole) ?? "seller";
      const progress = row.status === "signed_up" ? progressText(role, await factsFor(row.refereeId, role)) : null;
      const reward = (row.referrerReward ?? null) as { months?: number; credits?: number } | null;
      return {
        id: row.id,
        name: names.get(row.refereeId) ?? "A business",
        role,
        status: row.status,
        statusLabel: STATUS_LABEL[row.status] ?? row.status,
        progress,
        reason: row.status === "rejected" ? row.reason : null,
        reward: reward ? rewardText({ months: reward.months ?? 0, credits: reward.credits ?? 0 }) : null,
        joinedAt: row.createdAt.toISOString(),
      };
    }),
  );
  const rewarded = rows.filter((row) => row.status === "rewarded");
  const earned = rewarded.reduce(
    (sum, row) => {
      const reward = (row.referrerReward ?? {}) as { months?: number; credits?: number };
      return { months: sum.months + (reward.months ?? 0), credits: sum.credits + (reward.credits ?? 0) };
    },
    { months: 0, credits: 0 },
  );
  return {
    code: code.code,
    rewardChoice: asRewardChoice(code.rewardChoice),
    paying: user ? isPaying(user) : false,
    role: asReferralRole(user?.role) ?? "seller",
    referrals: list,
    counts: { joined: rows.length, rewarded: rewarded.length, waiting: rows.filter((row) => row.status === "signed_up").length },
    earned,
    freeUntil: free?.endsAt.toISOString() ?? null,
  };
}

export type ReferralOverview = Awaited<ReturnType<typeof referralOverview>>;

/** Admin › Referrals. */
export async function adminReferrals(filter: "all" | "signed_up" | "rewarded" | "rejected", take = 200) {
  const rows = await db.referral.findMany({ where: filter === "all" ? {} : { status: filter }, orderBy: { createdAt: "desc" }, take });
  const ids = [...new Set(rows.flatMap((row) => [row.referrerId, row.refereeId]))];
  const [names, users] = await Promise.all([
    businessNames(ids),
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, phone: true, role: true } }),
  ]);
  const byId = new Map(users.map((user) => [user.id, user]));
  const counts = await db.referral.groupBy({ by: ["status"], _count: { _all: true } });
  return {
    rows: rows.map((row) => ({ ...row, referrerName: names.get(row.referrerId) ?? "—", refereeName: names.get(row.refereeId) ?? "—", referrer: byId.get(row.referrerId) ?? null, referee: byId.get(row.refereeId) ?? null })),
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Record<string, number>,
  };
}

/** Admin: count a referral now (checked by hand), or turn one down. */
export async function adminDecideReferral(referralId: string, decision: "reward" | "reject", reason?: string) {
  if (decision === "reward") return rewardReferral(referralId);
  await db.referral.updateMany({ where: { id: referralId, status: "signed_up" }, data: { status: "rejected", reason: reason?.slice(0, 300) || "Turned down by the team" } });
  return true;
}
