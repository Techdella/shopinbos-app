import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { recheckPartnerPayIns } from "@/lib/logistics/payins.server";
import { partnerForUser } from "../../_shared";

export const dynamic = "force-dynamic";

// "I've paid. Check again" on the app's late pay-in card: looks for new transfers into the partner's pay-in account
// and refreshes their late standing (lib/logistics/payins.server.ts recheckPartnerPayIns). At most once a minute.

export const POST = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "We couldn't find your company. Log out and in again.", 404);
  const result = await recheckPartnerPayIns(partner.id);
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  const cleared = result.overdue <= 0;
  return ok({
    cleared,
    matched: result.matched,
    owed: result.owed,
    overdue: result.overdue,
    paused: result.paused,
    message: cleared
      ? "We found your payment. Thanks, you're back to getting all jobs."
      : "We haven't seen a new payment yet. Transfers can take a few minutes to arrive. Try again soon.",
  });
});
