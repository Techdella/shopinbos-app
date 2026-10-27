import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { withAdmin } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { readIdentityChecks } from "@shared/partner-tiers";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";

// The team decides a partner's NIN or BVN/bank check by hand: when no KYC provider is set up (the partner sent a
// NIN slip instead) or the names didn't match and the team checked another way. Only an existing check can be
// decided; the full number is never stored, so there's nothing else to edit.
const Schema = z.discriminatedUnion("action", [
  z.object({ check: z.enum(["nin", "payout"]), action: z.literal("approve") }),
  z.object({ check: z.enum(["nin", "payout"]), action: z.literal("reject"), reason: z.string().trim().min(3, "Say what they need to fix.").max(300) }),
]);

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");

  const partner = await db.logisticsPartner.findUnique({ where: { id }, select: { identityChecks: true } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);
  const checks = readIdentityChecks(partner.identityChecks);
  const current = checks[parsed.data.check];
  if (!current) return apiError("BAD_REQUEST", parsed.data.check === "nin" ? "They haven't entered a NIN yet." : "They haven't added a BVN or bank account yet.");

  const { rejectionReason: _old, ...rest } = current;
  checks[parsed.data.check] = (parsed.data.action === "approve"
    ? { ...rest, status: "approved" }
    : { ...rest, status: "rejected", rejectionReason: parsed.data.reason }) as never;

  await db.logisticsPartner.update({ where: { id }, data: { identityChecks: checks as unknown as Prisma.InputJsonValue } });
  const tier = await refreshPartnerTier(id);
  revalidatePath(`/admin/logistics-partners/${id}`);
  return ok({ check: checks[parsed.data.check], tier });
});
