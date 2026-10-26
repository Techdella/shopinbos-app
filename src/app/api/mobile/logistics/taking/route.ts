import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { docsSentFor, TAKING_BLOCK_ERRORS, takingJobsBlock, takingStatusFor } from "@shared/taking-jobs";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// The "Taking new jobs" switch on Jobs. POST { taking } moves the company between "active" (shops can find and
// book you) and "paused" (hidden from new bookings; jobs you already have carry on). Until the company is set up and
// verified the switch is refused with the reason (shared/taking-jobs.ts): finish set-up, add your documents, we're
// checking them, fix them, or on hold (only a company the Shopinbos team suspended). A verified company whose status
// is still an older value (for example "pending") is moved to active/paused like any other.

export const POST = withLogistics(async (req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "We couldn't find your company. Log out and in again.", 404);
  const body = (await req.json().catch(() => null)) as { taking?: unknown } | null;
  if (typeof body?.taking !== "boolean") return apiError("BAD_REQUEST", "Tap the switch again.");
  const block = takingJobsBlock({
    status: partner.status,
    verificationStatus: partner.verificationStatus,
    onboarded: isOnboardingComplete(partner),
    docsSent: docsSentFor(partner.verificationDocuments),
  });
  // Pausing is always allowed (except on hold); switching on needs a verified company.
  if (block === "hold" || (block && body.taking)) {
    const refusal = TAKING_BLOCK_ERRORS[block];
    return apiError(refusal.code, refusal.message, 403);
  }
  const status = takingStatusFor(body.taking);
  if (status !== partner.status) await db.logisticsPartner.update({ where: { id: partner.id }, data: { status } });
  return ok({ taking: body.taking });
});
