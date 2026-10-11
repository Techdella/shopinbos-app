import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { filterReviews, parseReviewFilters, summarizeReviews } from "@/lib/reviews/pure";
import { loadReviews } from "@/lib/reviews/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/app/reviews?rating=&source=&status=&product=&photo=1&reply=needed&q=&page=&limit=
// Every review for the seller's store across sources, filtered, with the overview numbers.
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const all = await loadReviews(store.id);
  const filtered = filterReviews(all, parseReviewFilters(params));
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 50));
  return NextResponse.json({
    data: filtered.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total: filtered.length, summary: summarizeReviews(all) },
  });
});
