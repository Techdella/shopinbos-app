import { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { decideFeatured } from "@/lib/logistics/partner-reach.server";

// Featured partners (shared/partner-reach.ts): the team approves a Top partner's application, turns it down with a
// reason the partner sees, or takes the badge away. Approving needs the partner to still be a Top partner (Tier 3).
const Schema = z.object({ action: z.enum(["approve", "reject", "remove"]), reason: z.string().trim().max(300).optional() });

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "action must be approve, reject or remove");
  const result = await decideFeatured(id, parsed.data.action, parsed.data.reason);
  if (!result.ok) return apiError(result.error === "Logistics partner not found" ? "NOT_FOUND" : "CONFLICT", result.error, result.error === "Logistics partner not found" ? 404 : 409);
  revalidatePath(`/admin/logistics-partners/${id}`);
  revalidatePath("/admin/logistics-partners");
  return ok({ featuredStatus: result.status });
});
