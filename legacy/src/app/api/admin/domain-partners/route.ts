import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withAdmin } from "@/lib/auth/middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/domain-partners — list all
export const GET = withAdmin(async () => {
  const partners = await db.domainPartner.findMany({
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ data: partners });
});

// POST /api/admin/domain-partners — create
export const POST = withAdmin(async (req: NextRequest) => {
  const body = await req.json() as {
    name?: string;
    baseUrl?: string;
    affiliateUrl?: string | null;
    logoUrl?: string | null;
    description?: string;
    featured?: boolean;
    sortOrder?: number;
    active?: boolean;
  };

  if (!body.name?.trim() || !body.baseUrl?.trim()) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "name and baseUrl are required" } },
      { status: 400 }
    );
  }

  const partner = await db.domainPartner.create({
    data: {
      name: body.name.trim(),
      baseUrl: body.baseUrl.trim(),
      affiliateUrl: body.affiliateUrl?.trim() ?? null,
      logoUrl: body.logoUrl?.trim() ?? null,
      description: body.description?.trim() ?? "",
      featured: body.featured ?? false,
      sortOrder: body.sortOrder ?? 0,
      active: body.active ?? true,
    },
  });

  return NextResponse.json({ data: partner }, { status: 201 });
});
