import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { PARTNER_LEVEL_RULES } from "@shared/dropship-rules";
import {
  DEFAULT_HIGH_VALUE_RULES,
  FEATURED_PROBLEM_WORDS,
  HIGH_VALUE_KEY,
  HIGH_VALUE_PARTNER_MESSAGE,
  canTakeHighValue,
  featuredApplyProblem,
  highValueReason,
  lagosWeekStart,
  nextPayoutDay,
  readHighValueRules,
  type HighValueReason,
  type HighValueRules,
  type ParcelLine,
} from "@shared/partner-reach";

// Delivery partner tiers control reach, server side (the rules are shared/partner-reach.ts):
//   - the admin's high-value rules (PlatformSetting "logistics.high_value") and whether an order or bag is high-value,
//     so only Top partners (Tier 3) are offered, booked or can accept those parcels;
//   - "Apply to be featured" for Top partners, and the team's decision;
//   - telling partners once that interstate jobs now need Trusted (Tier 2) while they still offer interstate below it.

// ─── High-value rules (Admin › Logistics partners › Reach rules) ────────────

export async function getHighValueRules(): Promise<HighValueRules> {
  const row = await db.platformSetting.findUnique({ where: { key: HIGH_VALUE_KEY } }).catch(() => null);
  return row ? readHighValueRules(row.value) : DEFAULT_HIGH_VALUE_RULES;
}

export async function saveHighValueRules(input: unknown, adminId: string, note?: string | null): Promise<HighValueRules> {
  const rules = readHighValueRules(input);
  const before = await db.platformSetting.findUnique({ where: { key: HIGH_VALUE_KEY } });
  const value = rules as unknown as Prisma.InputJsonValue;
  await db.$transaction([
    db.platformSetting.upsert({ where: { key: HIGH_VALUE_KEY }, create: { key: HIGH_VALUE_KEY, value, updatedById: adminId }, update: { value, updatedById: adminId } }),
    db.platformSettingChange.create({
      data: { key: HIGH_VALUE_KEY, before: (before?.value ?? undefined) as Prisma.InputJsonValue | undefined, after: value, note: note?.trim().slice(0, 300) || null, changedById: adminId },
    }),
  ]);
  return rules;
}

/** The store products' types and names, for the category check. */
async function linesFor(productIds: readonly string[]): Promise<ParcelLine[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return [];
  return db.storeProduct.findMany({ where: { id: { in: ids } }, select: { name: true, productType: true } }).catch(() => []);
}

/** Is a bag or order worth `orderValue` naira with these store products high-value? */
export async function highValueFor(input: { orderValue: number; productIds?: readonly string[]; names?: readonly string[] }, rules?: HighValueRules): Promise<HighValueReason | null> {
  const resolved = rules ?? (await getHighValueRules());
  const lines = [...(await linesFor(input.productIds ?? [])), ...(input.names ?? []).map((name) => ({ name, productType: null }))];
  return highValueReason({ orderValue: input.orderValue, lines }, resolved);
}

/** The product ids on a saved order's items JSON ({ productId, name, … }). */
export function orderItemRefs(items: unknown): { productIds: string[]; names: string[] } {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  return {
    productIds: list.map((item) => (typeof item?.productId === "string" ? item.productId : "")).filter(Boolean),
    names: list.map((item) => (typeof item?.name === "string" ? item.name : "")).filter(Boolean),
  };
}

/** A store order: its total and its lines. */
export async function highValueOrder(order: { total: number; items: unknown }): Promise<boolean> {
  const refs = orderItemRefs(order.items);
  return (await highValueFor({ orderValue: Number(order.total) || 0, productIds: refs.productIds, names: refs.productIds.length ? [] : refs.names })) !== null;
}

/** Why this partner can't be given a high-value parcel, or null (Top partners can). */
export async function highValuePartnerProblem(partnerId: string): Promise<string | null> {
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { level: true } });
  return partner && canTakeHighValue(partner.level) ? null : HIGH_VALUE_PARTNER_MESSAGE;
}

// ─── Featured ────────────────────────────────────────────────────────────────

export type FeaturedResult = { ok: true; status: string } | { ok: false; error: string };

/** A Top partner asks to be featured. The team decides in Admin › Logistics partners. */
export async function applyToBeFeatured(partnerId: string): Promise<FeaturedResult> {
  // The level is refreshed first, so a partner who has just reached Top partner can apply straight away.
  await import("./partner-levels.server").then((levels) => levels.refreshPartnerLevel(partnerId)).catch(() => null);
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { id: true, displayName: true, level: true, featuredStatus: true } });
  if (!partner) return { ok: false, error: "We couldn't find your delivery company." };
  const problem = featuredApplyProblem(partner);
  if (problem) return { ok: false, error: FEATURED_PROBLEM_WORDS[problem] };
  const moved = await db.logisticsPartner.updateMany({
    where: { id: partner.id, featuredStatus: { in: ["none", "rejected"] } },
    data: { featuredStatus: "applied", featuredAppliedAt: new Date(), featuredNote: null },
  });
  if (moved.count !== 1) return { ok: false, error: FEATURED_PROBLEM_WORDS.applied };
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 20 }).catch(() => []);
  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "logistics",
        priority: "info",
        title: `${partner.displayName} applied to be featured`,
        description: "A Top partner (Tier 3) asked to be featured. Approve or turn it down on their page.",
        link: `/admin/logistics-partners/${partner.id}#featured`,
        event: "admin.review",
        dedupeKey: `logistics.featured.applied:${partner.id}:${Date.now()}`,
      }).catch(() => null),
    ),
  );
  return { ok: true, status: "applied" };
}

/** The team's decision. Approving needs the partner to still be a Top partner. */
export async function decideFeatured(partnerId: string, decision: "approve" | "reject" | "remove", note?: string | null): Promise<FeaturedResult> {
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { id: true, slug: true, userId: true, level: true, featuredStatus: true } });
  if (!partner) return { ok: false, error: "Logistics partner not found" };
  if (decision === "approve" && !canTakeHighValue(partner.level)) return { ok: false, error: "Only Top partners (Tier 3) can be featured." };
  const now = new Date();
  const data =
    decision === "approve"
      ? { featuredStatus: "featured", featuredAt: now, featuredNote: null }
      : decision === "reject"
        ? { featuredStatus: "rejected", featuredAt: null, featuredNote: note?.trim().slice(0, 300) || null }
        : { featuredStatus: "none", featuredAt: null, featuredNote: note?.trim().slice(0, 300) || null };
  await db.logisticsPartner.update({ where: { id: partner.id }, data });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  await createNotification({
    userId: partner.userId,
    type: "logistics",
    priority: decision === "approve" ? "success" : "info",
    title: decision === "approve" ? "You're featured on Shopinbos" : decision === "reject" ? "Your featured application wasn't approved" : "You're no longer featured",
    description:
      decision === "approve"
        ? "Shops now see you at the top of their rider lists, with a Featured badge."
        : data.featuredNote ?? (decision === "reject" ? "You can apply again later." : "Talk to the team if you have questions."),
    link: "/logistics/level",
    event: "account.update",
    dedupeKey: `logistics.featured.${decision}:${partner.id}:${now.getTime()}`,
  }).catch(() => null);
  return { ok: true, status: data.featuredStatus };
}

// ─── The rider's one number ──────────────────────────────────────────────────

/**
 * "Earned this week · paid on Thursday": delivery fees (after any Shopinbos fee) for jobs delivered since Monday
 * (Lagos), and the next working day, when the gateway settles fees split to the partner (shared/partner-reach.ts).
 */
export async function earnedThisWeek(partnerId: string, now = new Date()) {
  const jobs = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partnerId, status: "delivered", deliveredAt: { gte: lagosWeekStart(now) } },
    select: { deliveryFee: true, platformFee: true, netAmount: true },
  });
  const amount = jobs.reduce((sum, job) => sum + (job.netAmount || job.deliveryFee - (job.platformFee || 0)), 0);
  return { amount: Math.round(amount * 100) / 100, jobs: jobs.length, payoutDay: nextPayoutDay(now) };
}

// ─── Interstate needs Trusted ────────────────────────────────────────────────

const INTERSTATE_GATED_WHERE = {
  services: { has: "interstate" },
  verificationStatus: "verified" as const,
  level: { notIn: ["trusted", "cash_trusted"] },
} satisfies Prisma.LogisticsPartnerWhereInput;

/** Partners who offer interstate below Trusted: their switch stays, but interstate jobs don't route to them. */
export function interstateGatedCount() {
  return db.logisticsPartner.count({ where: INTERSTATE_GATED_WHERE });
}

/**
 * Tells each partner who still offers interstate below Trusted, once, what they need for interstate jobs. Safe to
 * run often (cron /api/cron/delivery-jobs): each partner is told once (interstateNoticeAt).
 */
export async function notifyInterstateGated(limit = 200) {
  const partners = await db.logisticsPartner.findMany({ where: { ...INTERSTATE_GATED_WHERE, interstateNoticeAt: null }, select: { id: true, userId: true }, take: limit });
  const t = PARTNER_LEVEL_RULES.trusted;
  let told = 0;
  for (const partner of partners) {
    const claimed = await db.logisticsPartner.updateMany({ where: { id: partner.id, interstateNoticeAt: null }, data: { interstateNoticeAt: new Date() } });
    if (claimed.count !== 1) continue;
    await createNotification({
      userId: partner.userId,
      type: "logistics",
      priority: "info",
      title: "Interstate jobs now open at Trusted (Tier 2)",
      description: `Keep your interstate switch on. Interstate jobs come to you once you reach Trusted: ${t.delivered} delivered jobs, a rating of ${t.rating} or more, under ${t.failedRate * 100}% failed drops and your base address verified.`,
      link: "/logistics/level",
      event: "account.update",
      dedupeKey: `logistics.interstate_gated:${partner.id}`,
    }).catch(() => null);
    told += 1;
  }
  return { told };
}
