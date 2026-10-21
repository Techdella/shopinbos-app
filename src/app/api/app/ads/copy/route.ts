import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { writeAdCopy } from "@/lib/ad-campaigns/campaigns.server";
import { AD_OBJECTIVES } from "@shared/ad-campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({ productIds: z.array(z.string().max(64)).min(1).max(20), objective: z.enum(AD_OBJECTIVES) });

// "Write with Peggy" in the campaign builder: a headline and ad text per product.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick the products first.");
  const limited = await meterAi(user.id, "text", Math.min(5, parsed.data.productIds.length), "caption");
  if (limited) return limited;
  return ok(await writeAdCopy(store, parsed.data.productIds, parsed.data.objective));
});
