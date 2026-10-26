import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { supplierPlanLimits } from "@/lib/plan-limits";
import { atLimit } from "@shared/plans";
import { canTrade, supplierForUser } from "../_shared";

export const dynamic = "force-dynamic";

// The people on a supplier's account, for the supplier app (the web's /supplier/team, src/app/actions/supplier.ts).
// GET → { members, limit, canAdd }. POST { name, email, phone?, role } adds someone (or brings them back), within the
// plan's team limit. Changing or removing one: ./[id].

const TEAM_ROLES = ["manager", "inventory", "support", "sales"] as const;

const Body = z.object({
  name: z.string().trim().min(2, "Add their name.").max(80),
  email: z.string().trim().toLowerCase().email("Add a valid email."),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(TEAM_ROLES).default("manager"),
});

async function teamView(supplierId: string, userId: string) {
  const [members, dbUser] = await Promise.all([
    db.supplierTeamMember.findMany({
      where: { supplierId },
      orderBy: [{ status: "asc" }, { invitedAt: "desc" }],
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, invitedAt: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } }),
  ]);
  const limit = supplierPlanLimits(dbUser ?? {}).teamMembers;
  const active = members.filter((member) => member.status === "active").length;
  return { members, limit, canAdd: !atLimit(active, limit) };
}

export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  return ok({ ...(await teamView(supplier.id, user.id)), verified: canTrade(supplier) });
});

export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (!canTrade(supplier)) return apiError("VERIFICATION_REQUIRED", "You can add people once your business is verified.", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");

  const view = await teamView(supplier.id, user.id);
  const existing = view.members.find((member) => member.email === parsed.data.email);
  if (!view.canAdd && existing?.status !== "active") return apiError("PLAN_LIMIT", "Your plan's team is full. Remove someone first.", 403);

  const { name, email, phone, role } = parsed.data;
  await db.supplierTeamMember.upsert({
    where: { supplierId_email: { supplierId: supplier.id, email } },
    create: { supplierId: supplier.id, name, email, phone: phone || undefined, role, status: "active" },
    update: { name, phone: phone || undefined, role, status: "active" },
  });
  return ok(await teamView(supplier.id, user.id));
});
