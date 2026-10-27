import { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";

// Tier 1 order limits (shared/partner-tiers.ts): the team lifts them early, or puts them back. Graduation lifts them
// by itself once the thresholds are met (src/lib/logistics/partner-tiers.server.ts checkGraduation).
const Schema = z.object({ action: z.enum(["lift", "restore"]) });

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "action must be lift or restore");
  const partner = await db.logisticsPartner.update({
    where: { id },
    data: { limitsLiftedAt: parsed.data.action === "lift" ? new Date() : null },
    select: { id: true, limitsLiftedAt: true },
  }).catch(() => null);
  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);
  revalidatePath(`/admin/logistics-partners/${id}`);
  return ok(partner);
});
