import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { cancelCampaign } from "@/lib/push-campaigns/campaigns.server";
import { adminOf, pushError } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/push/campaigns/:id/cancel — a scheduled campaign that hasn't started
export const POST = withAdmin(async (_req: NextRequest, { user, params }) => {
  try {
    await cancelCampaign(String(params.id), await adminOf(user));
    return NextResponse.json({ data: { cancelled: true } });
  } catch (error) {
    return pushError(error);
  }
});
