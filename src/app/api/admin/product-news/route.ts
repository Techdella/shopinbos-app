import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withAdmin } from "@/lib/auth/middleware";
import { newsError, readNewsInput } from "@/lib/email/product-news.api";
import { BROADCAST_SELECT, createBroadcast } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/product-news?page=1&limit=20 — product news emails, newest first
export const GET = withAdmin(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
  const [data, total] = await Promise.all([
    db.productNewsBroadcast.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit, select: BROADCAST_SELECT }),
    db.productNewsBroadcast.count(),
  ]);
  return NextResponse.json({ data, meta: { page, limit, total } });
});

// POST /api/admin/product-news — save a new draft
export const POST = withAdmin(async (req: NextRequest, { user }) => {
  const input = await readNewsInput(req);
  if ("error" in input) return input.error;
  try {
    return NextResponse.json({ data: await createBroadcast(input.data, user.id) }, { status: 201 });
  } catch (error) {
    return newsError(error);
  }
});
