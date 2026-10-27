import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { resendFailed } from "@/lib/push-campaigns/campaigns.server";
import { adminOf, pushError } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/admin/push/campaigns/:id/resend — once per sent campaign: pushes again to phones and browsers that
// failed and are still switched on, and retries people the run couldn't reach.
export const POST = withAdmin(async (_req: NextRequest, { user, params }) => {
  try {
    return NextResponse.json({ data: await resendFailed(String(params.id), await adminOf(user)) });
  } catch (error) {
    return pushError(error);
  }
});
