import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// The "Taking new jobs" switch on Today. POST { taking } moves the company between "active" (shops can find and
// book you) and "paused" (hidden from new bookings; jobs you already have carry on). A company the Shopinbos team
// suspended can't switch itself back on.

export const POST = withLogistics(async (req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "We couldn't find your company. Log out and in again.", 404);
  const body = (await req.json().catch(() => null)) as { taking?: unknown } | null;
  if (typeof body?.taking !== "boolean") return apiError("BAD_REQUEST", "Tap the switch again.");
  if (partner.status !== "active" && partner.status !== "paused") {
    return apiError("FORBIDDEN", "Your account is on hold. Talk to the Shopinbos team in Help to switch it back on.", 403);
  }
  const status = body.taking ? "active" : "paused";
  if (status !== partner.status) await db.logisticsPartner.update({ where: { id: partner.id }, data: { status } });
  return ok({ taking: body.taking });
});
