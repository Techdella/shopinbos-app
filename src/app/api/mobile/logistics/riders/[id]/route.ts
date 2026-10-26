import { NextRequest } from "next/server";
import { z } from "zod";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { partnerForUser } from "../../_shared";

export const dynamic = "force-dynamic";

// One rider in the delivery partner app. PATCH { active: false } takes them off the team (the web riders page's
// "Remove": the rider is turned off and their Riders app link stops working); { active: true } brings them back
// (send them a new link from Add rider).

const Body = z.object({ active: z.boolean() });

export const PATCH = withLogistics(async (req: NextRequest, { user, params }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  if (!isOnboardingComplete(partner) || partner.verificationStatus !== "verified") {
    return apiError("FORBIDDEN", "You can change your riders once your company is checked.", 403);
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Choose on or off.");
  const rider = await db.logisticsTeamMember.findFirst({ where: { id: String(params.id), logisticsPartnerId: partner.id, role: "rider" }, select: { id: true } });
  if (!rider) return apiError("NOT_FOUND", "We couldn't find that rider. Pull down to refresh.", 404);
  const updated = await db.logisticsTeamMember.update({
    where: { id: rider.id },
    data: parsed.data.active ? { status: "active" } : { status: "inactive", riderTokenHash: null, online: false },
    select: { id: true, status: true },
  });
  return ok({ id: updated.id, active: updated.status === "active" });
});
