import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { partnerLevelView } from "@/lib/logistics/partner-levels.server";
import { PARTNER_LEVELS, PARTNER_LEVEL_LABELS, PARTNER_LEVEL_TIER, POD_REMIT_HOURS } from "@shared/dropship-rules";
import { TIER_UNLOCKS } from "@shared/partner-reach";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/logistics/level: the delivery partner's reach tier (Tier 1 Verified → Tier 2 Trusted → Tier 3 Top
// partner, the same screen as the web's /logistics/level), refreshed from their record on every read:
//   { level: "verified"|"trusted"|"cash_trusted", next: same | null, tier: 1|2|3,
//     goals: [{ key, label, have, need, done, kind: "count"|"check" }],
//     perks: { prepaid, payOnDelivery, interstate, rankBoost, highValue, canApplyFeatured, fasterPayouts },
//     featuredStatus: "none"|"applied"|"featured"|"rejected", featuredNow, featuredNote, interstateGated,
//     fasterPayoutsLive, levels: [{ key, label, tier, unlocks: string[] }],
//     cashCap (naira), podOpen, podOn, codPaused, lockedMessage, remitHours }  (pay on delivery: unchanged)
// Pay on delivery can be switched on only when podOpen (PUT /api/mobile/logistics/market answers 403 pod_locked).
// POST ./featured applies to be featured (Top partners only).
export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const view = await partnerLevelView(partner.id);
  if (!view) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  return ok({
    ...view,
    levels: PARTNER_LEVELS.map((key) => ({ key, label: PARTNER_LEVEL_LABELS[key], tier: PARTNER_LEVEL_TIER[key], unlocks: TIER_UNLOCKS[key] })),
    remitHours: POD_REMIT_HOURS,
  });
});
