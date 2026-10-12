import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withAdmin } from "@/lib/auth/middleware";
import { newsError } from "@/lib/email/product-news.api";
import { BROADCAST_SELECT, retryFailed } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/admin/product-news/:id/retry — resend to recipients whose batch the email provider refused
export const POST = withAdmin(async (_req: NextRequest, { params }) => {
  const id = String(params.id);
  try {
    const progress = await retryFailed(id);
    const broadcast = await db.productNewsBroadcast.findUnique({ where: { id }, select: BROADCAST_SELECT });
    return NextResponse.json({ data: { broadcast, progress } });
  } catch (error) {
    return newsError(error);
  }
});
