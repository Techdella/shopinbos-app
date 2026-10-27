import { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { TIER_RULES_KEY } from "@shared/partner-tiers";
import { getTierRules, saveTierRules } from "@/lib/logistics/partner-tiers.server";

// Admin › Logistics partners › Tier rules: Tier 1 limits and the graduation thresholds that lift them.
const Schema = z.object({
  maxOrderValue: z.coerce.number().int().min(1_000, "The order limit must be at least ₦1,000.").max(100_000_000),
  maxActiveOrders: z.coerce.number().int().min(1, "Allow at least 1 open job.").max(10_000),
  graduation: z.object({
    minDeliveries: z.coerce.number().int().min(0).max(100_000),
    minRating: z.coerce.number().min(0).max(5, "Ratings go up to 5."),
    maxDisputeRate: z.coerce.number().min(0).max(100, "A rate can't be over 100%."),
  }),
  note: z.string().trim().max(300).optional(),
});

export const GET = withAdmin(async () => {
  const [rules, changes] = await Promise.all([
    getTierRules(),
    db.platformSettingChange.findMany({ where: { key: TIER_RULES_KEY }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, before: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } } }),
  ]);
  return ok({ rules, changes });
});

export const PUT = withAdmin(async (req: NextRequest, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  const { note, ...rules } = parsed.data;
  const saved = await saveTierRules(rules, user.id, note);
  revalidatePath("/admin/logistics-partners/tier-rules");
  return ok(saved);
});
