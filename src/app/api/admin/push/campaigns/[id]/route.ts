import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { deleteDraft, updateCampaign } from "@/lib/push-campaigns/campaigns.server";
import { adminOf, parseCampaignInput, pushError, readJson } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/push/campaigns/:id — change a draft (a changed message needs a new test before it can go out)
export const PATCH = withAdmin(async (req: NextRequest, { user, params }) => {
  const body = await readJson(req);
  if ("error" in body) return body.error;
  const input = parseCampaignInput(body.data);
  if ("error" in input) return input.error;
  try {
    return NextResponse.json({ data: await updateCampaign(String(params.id), input.data, await adminOf(user)) });
  } catch (error) {
    return pushError(error);
  }
});

// DELETE /api/admin/push/campaigns/:id — a draft or a cancelled campaign
export const DELETE = withAdmin(async (_req: NextRequest, { params }) => {
  try {
    await deleteDraft(String(params.id));
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return pushError(error);
  }
});
