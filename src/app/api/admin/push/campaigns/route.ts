import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { createCampaign, listCampaigns } from "@/lib/push-campaigns/campaigns.server";
import { adminOf, parseCampaignInput, pushError, readJson } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/push/campaigns?limit=30 — campaigns, newest first, with live counts for recent ones
export const GET = withAdmin(async (req: NextRequest) => {
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 30));
  try {
    const data = await listCampaigns(limit);
    return NextResponse.json({ data, meta: { page: 1, limit, total: data.length } });
  } catch (error) {
    return pushError(error);
  }
});

// POST /api/admin/push/campaigns — save a new draft { title, body, linkKey, customPath?, audience, urgent }
export const POST = withAdmin(async (req: NextRequest, { user }) => {
  const body = await readJson(req);
  if ("error" in body) return body.error;
  const input = parseCampaignInput(body.data);
  if ("error" in input) return input.error;
  try {
    return NextResponse.json({ data: await createCampaign(input.data, await adminOf(user)) }, { status: 201 });
  } catch (error) {
    return pushError(error);
  }
});
