import { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { HIGH_VALUE_KEY } from "@shared/partner-reach";
import { getHighValueRules, saveHighValueRules } from "@/lib/logistics/partner-reach.server";

// Admin › Logistics partners › Reach rules: what makes a parcel high-value (only Top partners, Tier 3, carry those):
// an order worth more than the threshold, or a product type / name word on the list (shared/partner-reach.ts).
const Schema = z.object({
  minOrderValue: z.coerce.number().int().min(1_000, "The threshold must be at least ₦1,000.").max(1_000_000_000),
  productTypes: z.array(z.string().trim().min(1).max(40)).max(50),
  keywords: z.array(z.string().trim().min(1).max(40)).max(50),
  note: z.string().trim().max(300).optional(),
});

export const GET = withAdmin(async () => {
  const [rules, changes] = await Promise.all([
    getHighValueRules(),
    db.platformSettingChange.findMany({ where: { key: HIGH_VALUE_KEY }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, before: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } } }),
  ]);
  return ok({ rules, changes });
});

export const PUT = withAdmin(async (req: NextRequest, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  const { note, ...rules } = parsed.data;
  const saved = await saveHighValueRules(rules, user.id, note);
  revalidatePath("/admin/logistics-partners/reach-rules");
  return ok(saved);
});
