import "server-only";

import { db } from "@/lib/db/client";
import { partnerRecord } from "@/lib/logistics/partner-tiers.server";
import { notifyAdminsToReview } from "@/lib/notifications/events.server";
import {
  INTERSTATE_LOCKED_MESSAGE,
  POD_LOCKED_MESSAGE,
  canOfferPayOnDelivery,
  partnerLevel,
  partnerLevelGoals,
  partnerPerks,
  podCashCap,
  type PartnerLevel,
  type PartnerRecord,
} from "@shared/dropship-rules";

// Delivery partner tiers, server side (the rules are shared/dropship-rules.ts): 1 Verified → 2 Trusted → 3 Top partner
// (stored as cash_trusted). Tiers control reach, not cash: riders never hold cash (shared/pay-at-door.ts), so pay on
// delivery is open to every verified partner; interstate jobs open at Trusted, high-value parcels and featuring at
// Top partner. refreshPartnerLevel stores the tier, and when a partner drops below Trusted it takes interstate off
// their services. Called when a job is delivered, before the partner changes their services, and on the level screen.

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
    select: { services: true },
  });
  // Below Trusted: no interstate jobs (quoteFor in shared/delivery-market.ts reads the services).
  if (!partnerPerks(level).interstate && partner.services.includes("interstate")) {
    await db.logisticsPartner.update({ where: { id: partnerId }, data: { services: partner.services.filter((service) => service !== "interstate") } });
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
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { codPaused: true, offersPayOnDelivery: true, verificationStatus: true } });
  const { level, next, goals } = partnerLevelGoals(record);
  return {
    level,
    next,
    goals,
    perks: partnerPerks(level),
    cashCap: refreshed?.cap ?? podCashCap({ delivered: record.delivered }),
    podOpen: canOfferPayOnDelivery({ level, codPaused: partner?.codPaused, verificationStatus: partner?.verificationStatus ? String(partner.verificationStatus) : undefined }),
    podOn: !!partner?.offersPayOnDelivery,
    codPaused: !!partner?.codPaused,
    lockedMessage: POD_LOCKED_MESSAGE,
  };
}

/** Why this partner can't switch pay on delivery on, or null: they must be verified, and not owe cash from older jobs. */
export async function payOnDeliveryProblem(partnerId: string): Promise<string | null> {
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

/** A Top partner asks to be featured: the team gets it to review (once a week per partner). */
export async function applyToBeFeatured(partnerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const refreshed = await refreshPartnerLevel(partnerId);
  if (!refreshed || !partnerPerks(refreshed.level).canApplyFeatured) return { ok: false, error: "Featuring opens at Top partner (Tier 3)." };
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { displayName: true } });
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  await notifyAdminsToReview({
    title: `${partner?.displayName ?? "A delivery partner"} applied to be featured`,
    description: "A Top partner (Tier 3) asked to be featured to shops. Check their record and feature them if they fit.",
    link: `/admin/logistics-partners/${partnerId}`,
    dedupeKey: `partner.featured:${partnerId}:${week}`,
  });
  return { ok: true };
}
