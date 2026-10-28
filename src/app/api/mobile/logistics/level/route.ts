import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { partnerLevelView } from "@/lib/logistics/partner-levels.server";
import { PARTNER_LEVELS, PARTNER_LEVEL_LABELS, POD_REMIT_HOURS } from "@shared/dropship-rules";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/logistics/level: the delivery partner's track-record level (Verified → Trusted → Cash trusted, the
// same screen as the web's /logistics/level), refreshed from their record on every read:
//   { level: "verified"|"trusted"|"cash_trusted", next: same | null,
//     goals: [{ key, label, have, need, done, kind: "count"|"check" }],
//     cashCap (naira), podOpen, podOn, codPaused, lockedMessage,
//     levels: [{ key, label }], remitHours }
// Pay on delivery can be switched on only when podOpen (PUT /api/mobile/logistics/market answers 403 pod_locked).
export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const view = await partnerLevelView(partner.id);
  if (!view) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  return ok({ ...view, levels: PARTNER_LEVELS.map((key) => ({ key, label: PARTNER_LEVEL_LABELS[key] })), remitHours: POD_REMIT_HOURS });
});
