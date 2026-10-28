import "server-only";

import { db } from "@/lib/db/client";
import { partnerRecord } from "@/lib/logistics/partner-tiers.server";
import {
  PARTNER_LEVEL_TIER,
  POD_LOCKED_MESSAGE,
  canOfferPayOnDelivery,
  partnerLevel,
  partnerLevelGoals,
  podCashCap,
  type PartnerLevel,
  type PartnerRecord,
} from "@shared/dropship-rules";
import { FASTER_PAYOUTS_LIVE, featuredStatusOf, interstateGated, isFeaturedNow, levelPerks } from "@shared/partner-reach";

// Delivery partner reach tiers, server side (the rules are shared/dropship-rules.ts, what each tier unlocks is
// shared/partner-reach.ts): Tier 1 Verified → Tier 2 Trusted → Tier 3 Top partner (stored as cash_trusted). The
// pay-on-delivery side effects below belong to the pay-on-delivery rules and are left as they are.
// refreshPartnerLevel stores the level and cash cap and, when a partner drops below Cash trusted, switches pay on
// delivery off on the partner and on every shop connection. Called when a job is delivered, before the partner
// turns pay on delivery on, and when they open their level screen.

export async function partnerLevelRecord(partnerId: string, now = new Date()): Promise<PartnerRecord | null> {
  const partner = await db.logisticsPartner.findUnique({
    where: { id: partnerId },
    select: { verificationStatus: true, badges: true, createdAt: true, payInStrikes: true, cacNumber: true, verificationTier: true, guarantor: { select: { status: true } } },
  });
  if (!partner) return null;
  const record = await partnerRecord(partnerId);
  return {
    verified: partner.verificationStatus === "verified",
    delivered: record.completed,
    failed: record.disputes,
    rating: record.ratingCount > 0 ? record.rating : 0,
    baseVerified: partner.badges.includes("address_verified"),
    createdAt: partner.createdAt,
    lateRemittances: partner.payInStrikes,
    cacOrGuarantor: partner.verificationTier === "tier2" || !!partner.cacNumber || partner.guarantor?.status === "confirmed",
    now,
  };
}

export async function refreshPartnerLevel(partnerId: string): Promise<{ level: PartnerLevel; cap: number } | null> {
  const record = await partnerLevelRecord(partnerId);
  if (!record) return null;
  const level = partnerLevel(record);
  const cap = podCashCap({ delivered: record.delivered });
  await db.logisticsPartner.update({
    where: { id: partnerId },
    data: { level, codCashCap: cap, levelCheckedAt: new Date(), ...(level === "cash_trusted" ? {} : { offersPayOnDelivery: false }) },
  });
  if (level !== "cash_trusted") await db.deliveryConnection.updateMany({ where: { logisticsPartnerId: partnerId, partnerPod: true }, data: { partnerPod: false } });
  return { level, cap };
}

/** The partner's level screen: where they are, what's left, and whether pay on delivery is open. */
export async function partnerLevelView(partnerId: string) {
  const record = await partnerLevelRecord(partnerId);
  if (!record) return null;
  const refreshed = await refreshPartnerLevel(partnerId);
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { codPaused: true, offersPayOnDelivery: true, featuredStatus: true, featuredNote: true, services: true } });
  const { level, next, goals } = partnerLevelGoals(record);
  return {
    level,
    next,
    goals,
    cashCap: refreshed?.cap ?? podCashCap({ delivered: record.delivered }),
    podOpen: canOfferPayOnDelivery({ level, codPaused: partner?.codPaused }),
    podOn: !!partner?.offersPayOnDelivery,
    codPaused: !!partner?.codPaused,
    lockedMessage: POD_LOCKED_MESSAGE,
    // Reach tiers (shared/partner-reach.ts): the tier number, what it unlocks, featured and the interstate gate.
    tier: PARTNER_LEVEL_TIER[level],
    perks: levelPerks(level),
    featuredStatus: featuredStatusOf(partner?.featuredStatus),
    featuredNow: isFeaturedNow({ level, featuredStatus: partner?.featuredStatus }),
    featuredNote: partner?.featuredNote ?? null,
    interstateGated: interstateGated({ services: partner?.services ?? [], level }),
    fasterPayoutsLive: FASTER_PAYOUTS_LIVE,
  };
}

/**
 * Why this partner can't switch pay on delivery on, or null. Refreshes the level first, so a partner who just
 * earned it isn't held back by a stale value.
 */
export async function payOnDeliveryProblem(partnerId: string): Promise<string | null> {
  const refreshed = await refreshPartnerLevel(partnerId);
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { codPaused: true } });
  if (!refreshed || refreshed.level !== "cash_trusted") return POD_LOCKED_MESSAGE;
  if (partner?.codPaused) return "Pay on delivery is paused until your late cash is paid in.";
  return null;
}
