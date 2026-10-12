import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { ALL_NEWS_AUDIENCES, type NewsAudience } from "@/lib/email/product-news";
import { audienceCounts } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/product-news/audience?roles=seller,supplier — who'd get it, minus anyone who turned product news off
export const GET = withAdmin(async (req: NextRequest) => {
  const roles = (req.nextUrl.searchParams.get("roles") ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  if (roles.some((role) => !(ALL_NEWS_AUDIENCES as string[]).includes(role))) return apiError("VALIDATION_ERROR", "Unknown audience", 422);
  return NextResponse.json({ data: await audienceCounts(roles as NewsAudience[]) });
});
