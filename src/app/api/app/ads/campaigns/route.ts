import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { CampaignError, saveCampaignDraft } from "@/lib/ad-campaigns/campaigns.server";
import { CampaignInputSchema } from "@shared/ad-campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saves a campaign from /home/ads/new as a draft. ?id= replaces an unlaunched draft.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const parsed = CampaignInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the campaign details.");
  try {
    return created(await saveCampaignDraft(store.id, parsed.data, req.nextUrl.searchParams.get("id")));
  } catch (error) {
    return apiError("BAD_REQUEST", error instanceof CampaignError ? error.message : "Couldn't save the campaign.");
  }
});
