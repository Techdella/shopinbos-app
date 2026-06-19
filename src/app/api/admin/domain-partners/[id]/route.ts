import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withAdmin } from "@/lib/auth/middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/domain-partners/[id] — update
export const PATCH = withAdmin(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await req.json() as Record<string, unknown>;

  const partner = await db.domainPartner.update({
    where: { id },
    data: {
      ...(typeof body.name === "string" && { name: body.name.trim() }),
      ...(typeof body.baseUrl === "string" && { baseUrl: body.baseUrl.trim() }),
      ...(typeof body.affiliateUrl === "string" && { affiliateUrl: body.affiliateUrl.trim() || null }),
      ...(body.affiliateUrl === null && { affiliateUrl: null }),
      ...(typeof body.logoUrl === "string" && { logoUrl: body.logoUrl.trim() || null }),
      ...(body.logoUrl === null && { logoUrl: null }),
      ...(typeof body.description === "string" && { description: body.description.trim() }),
      ...(typeof body.featured === "boolean" && { featured: body.featured }),
      ...(typeof body.sortOrder === "number" && { sortOrder: body.sortOrder }),
      ...(typeof body.active === "boolean" && { active: body.active }),
    },
  });

  return NextResponse.json({ data: partner });
});

// DELETE /api/admin/domain-partners/[id] — remove
export const DELETE = withAdmin(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await db.domainPartner.delete({ where: { id } });
  return NextResponse.json({ data: { deleted: true } });
});
