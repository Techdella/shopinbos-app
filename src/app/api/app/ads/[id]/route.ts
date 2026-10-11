import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { AD_STATUSES } from "@shared/ads";

const UpdateSchema = z.object({
  headline: z.string().trim().min(1).max(80).optional(),
  primaryText: z.string().trim().min(1).max(500).optional(),
  dailyBudget: z.number().min(500).max(1_000_000).optional(),
  days: z.number().int().min(1).max(60).optional(),
  /** Total spent so far, as shown in Instagram, Facebook or TikTok. */
  spend: z.number().min(0).max(100_000_000).optional(),
  status: z.enum(AD_STATUSES).optional(),
});

async function findAd(userId: string, id: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  return store ? db.adCampaign.findFirst({ where: { id, storeId: store.id } }) : null;
}

export const PATCH = withSeller(async (req, { user, params }) => {
  const { id } = await params;
  const ad = await findAd(user.id, id);
  if (!ad) return apiError("NOT_FOUND", "Ad not found", 404);
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the ad details");

  const { status, ...changes } = parsed.data;
  const data: Record<string, unknown> = { ...changes };
  if (status && status !== ad.status) {
    data.status = status;
    if (status === "running" && !ad.startedAt) data.startedAt = new Date();
    if (status === "paused") data.pausedAt = new Date();
  }
  return ok(await db.adCampaign.update({ where: { id: ad.id }, data }));
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  const ad = await findAd(user.id, id);
  if (!ad) return apiError("NOT_FOUND", "Ad not found", 404);
  await db.adCampaign.delete({ where: { id: ad.id } });
  return ok({ id: ad.id });
});
