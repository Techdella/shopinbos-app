import { NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";

// The team called the partner's guarantor and records their answer ("by call"), for guarantors who couldn't use
// the texted code. "reset" puts it back to waiting so the partner can send the code again.
const Schema = z.object({ action: z.enum(["confirm", "decline", "reset"]) });

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "action must be confirm, decline or reset");

  const guarantor = await db.logisticsGuarantor.findUnique({ where: { logisticsPartnerId: id }, select: { id: true } });
  if (!guarantor) return apiError("NOT_FOUND", "This partner hasn't added a guarantor yet.", 404);

  const { action } = parsed.data;
  const updated = await db.logisticsGuarantor.update({
    where: { id: guarantor.id },
    data: action === "reset"
      ? { status: "pending", respondedVia: null, respondedAt: null, codeAttempts: 0 }
      : { status: action === "confirm" ? "confirmed" : "declined", respondedVia: "call", respondedAt: new Date(), codeHash: null, codeExpiresAt: null },
    select: { status: true, respondedVia: true, respondedAt: true },
  });
  const tier = await refreshPartnerTier(id);
  revalidatePath(`/admin/logistics-partners/${id}`);
  return ok({ guarantor: updated, tier });
});
