import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { apiError } from "@/lib/api/response";
import { sendTest } from "@/lib/push-campaigns/campaigns.server";
import { adminOf, pushError } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/push/campaigns/:id/test — the campaign to your own phone and browsers (and bell), through quiet
// hours. A real send needs a test of exactly the message going out.
export const POST = withAdmin(async (_req: NextRequest, { user, params }) => {
  const limit = await checkRateLimitShared(rateLimitKey("push-center-test", user.id), { maxRequests: 10, windowMs: 10 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "You've sent a few tests already. Try again in a few minutes.", 429);
  try {
    return NextResponse.json({ data: await sendTest(String(params.id), await adminOf(user)) });
  } catch (error) {
    return pushError(error);
  }
});
