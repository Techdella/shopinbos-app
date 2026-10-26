import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { canTrade, supplierForUser } from "../../_shared";

export const dynamic = "force-dynamic";

// One person on a supplier's account (the web's /supplier/team buttons). PATCH { active } turns them off or back on;
// DELETE removes them.

const Body = z.object({ active: z.boolean() });

async function owned(userId: string, id: string) {
  const supplier = await supplierForUser(userId);
  if (!supplier) return { error: apiError("NOT_FOUND", "Supplier profile not found", 404) };
  if (!canTrade(supplier)) return { error: apiError("VERIFICATION_REQUIRED", "You can change your team once your business is verified.", 403) };
  const member = await db.supplierTeamMember.findFirst({ where: { id, supplierId: supplier.id }, select: { id: true } });
  if (!member) return { error: apiError("NOT_FOUND", "We couldn't find that person. Pull down to refresh.", 404) };
  return { member };
}

export const PATCH = withSupplier(async (req: NextRequest, { user, params }) => {
  const found = await owned(user.id, String(params.id));
  if (found.error) return found.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Choose on or off.");
  const updated = await db.supplierTeamMember.update({
    where: { id: found.member.id },
    data: { status: parsed.data.active ? "active" : "inactive" },
    select: { id: true, status: true },
  });
  return ok(updated);
});

export const DELETE = withSupplier(async (_req: NextRequest, { user, params }) => {
  const found = await owned(user.id, String(params.id));
  if (found.error) return found.error;
  await db.supplierTeamMember.delete({ where: { id: found.member.id } });
  return ok({ id: found.member.id });
});
