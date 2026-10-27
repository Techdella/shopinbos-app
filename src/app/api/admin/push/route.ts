import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { listCampaigns, pushOverview } from "@/lib/push-campaigns/campaigns.server";
import { pushError } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/push — the Push center: devices by platform and role, delivery health for the last 7 days, and the
// latest campaigns with their counts (targeted, sent, delivered, errors, opened).
export const GET = withAdmin(async () => {
  try {
    const [overview, campaigns] = await Promise.all([pushOverview(), listCampaigns(30)]);
    return NextResponse.json({ data: { overview, campaigns } });
  } catch (error) {
    return pushError(error);
  }
});
