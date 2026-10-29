import "server-only";

import { db } from "@/lib/db/client";
import { PAY_ON_DELIVERY_OFF_MESSAGE, PAY_ON_DELIVERY_ON } from "@shared/checkout-payments";
import { partnerRecord } from "@/lib/logistics/partner-tiers.server";
import { tellInterstateTakenOff } from "@/lib/logistics/partner-reach.server";
import {
  INTERSTATE_LOCKED_MESSAGE,
  PARTNER_LEVEL_TIER,
  POD_LOCKED_MESSAGE,
  canOfferPayOnDelivery,
  partnerLevel,
  partnerLevelGoals,
  partnerPerks,
  podCashCap,
  type PartnerLevel,
  type PartnerRecord,
} from "@shared/dropship-rules";
import { FASTER_PAYOUTS_LIVE, featuredStatusOf, isFeaturedNow, levelPerks } from "@shared/partner-reach";

// Delivery partner tiers, server side (the rules are shared/dropship-rules.ts, what each tier unlocks is
// shared/partner-reach.ts): 1 Verified → 2 Trusted → 3 Top partner (stored as cash_trusted). Tiers control reach, not
// cash: riders never hold cash (shared/pay-at-door.ts), so pay on delivery is open to every verified partner, paused
// only while cash from older jobs is owed; interstate jobs open at Trusted, high-value parcels and featuring at Top
// partner. refreshPartnerLevel stores the tier, and when a partner is below Trusted it takes interstate off their
// services and tells them once what they need (src/lib/logistics/partner-reach.server.ts). Called when a job is
// delivered, before the partner changes their services, by the delivery-jobs cron and on the level screen.

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
  const partner = await db.logisticsPartner.update({
    where: { id: partnerId },
    data: { level, codCashCap: cap, levelCheckedAt: new Date(), ...(record.verified ? {} : { offersPayOnDelivery: false }) },
    select: { userId: true, services: true, verificationStatus: true },
  });
  // Below Trusted: no interstate jobs (quoteFor in shared/delivery-market.ts reads the level too). Interstate is taken
  // off their services and they're told once what they need (LogisticsPartner.interstateNoticeAt).
  if (!partnerPerks(level).interstate && partner.services.includes("interstate")) {
    await db.logisticsPartner.update({ where: { id: partnerId }, data: { services: partner.services.filter((service) => service !== "interstate") } });
    if (String(partner.verificationStatus) === "verified") await tellInterstateTakenOff({ id: partnerId, userId: partner.userId }).catch(() => undefined);
  }
  // Not verified (any more): no pay on delivery on any shop connection either.
  if (!record.verified) await db.deliveryConnection.updateMany({ where: { logisticsPartnerId: partnerId, partnerPod: true }, data: { partnerPod: false } });
  return { level, cap };
}

/** The partner's level screen: their tier, what's left to the next one, what each tier unlocks, and pay on delivery. */
export async function partnerLevelView(partnerId: string) {
  const record = await partnerLevelRecord(partnerId);
  if (!record) return null;
  const refreshed = await refreshPartnerLevel(partnerId);
  const partner = await db.logisticsPartner.findUnique({
    where: { id: partnerId },
    select: { codPaused: true, offersPayOnDelivery: true, verificationStatus: true, featuredStatus: true, featuredNote: true, interstateNoticeAt: true },
  });
  const { level, next, goals } = partnerLevelGoals(record);
  return {
    level,
    next,
    goals,
    cashCap: refreshed?.cap ?? podCashCap({ delivered: record.delivered }),
    podOpen: canOfferPayOnDelivery({ level, codPaused: partner?.codPaused, verificationStatus: partner?.verificationStatus ? String(partner.verificationStatus) : undefined }),
    podOn: !!partner?.offersPayOnDelivery,
    codPaused: !!partner?.codPaused,
    lockedMessage: POD_LOCKED_MESSAGE,
    // Reach tiers (shared/partner-reach.ts): the tier number, what it unlocks, featured and the interstate gate.
    tier: PARTNER_LEVEL_TIER[level],
    perks: levelPerks(level),
    featuredStatus: featuredStatusOf(partner?.featuredStatus),
    featuredNow: isFeaturedNow({ level, featuredStatus: partner?.featuredStatus }),
    featuredNote: partner?.featuredNote ?? null,
    // Below Trusted, once interstate has been taken off and they've been told: the level screen says what they need.
    interstateGated: !levelPerks(level).interstate && !!partner?.interstateNoticeAt,
    fasterPayoutsLive: FASTER_PAYOUTS_LIVE,
  };
}

/** Why this partner can't switch pay on delivery on, or null: they must be verified, and not owe cash from older jobs. */
export async function payOnDeliveryProblem(partnerId: string): Promise<string | null> {
  if (!PAY_ON_DELIVERY_ON) return PAY_ON_DELIVERY_OFF_MESSAGE;
  await refreshPartnerLevel(partnerId);
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { codPaused: true, verificationStatus: true } });
  if (!partner || partner.verificationStatus !== "verified") return POD_LOCKED_MESSAGE;
  if (partner.codPaused) return "Pay on delivery is paused until the cash you collected on older jobs is paid in.";
  return null;
}

/** Why this partner can't offer interstate delivery, or null: it opens at Trusted. Refreshes the tier first. */
export async function interstateProblem(partnerId: string): Promise<string | null> {
  const refreshed = await refreshPartnerLevel(partnerId);
  return refreshed && partnerPerks(refreshed.level).interstate ? null : INTERSTATE_LOCKED_MESSAGE;
}

// "Apply to be featured" is applyToBeFeatured in src/lib/logistics/partner-reach.server.ts (featuredStatus, the team
// approves or turns it down in Admin › Logistics partners).
