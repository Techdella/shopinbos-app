import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { newsError } from "@/lib/email/product-news.api";
import { loadBroadcast, retryFailed } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/admin/product-news/:id/retry — resend to recipients whose batch the email provider refused
export const POST = withAdmin(async (_req: NextRequest, { params }) => {
  const id = String(params.id);
  try {
    const progress = await retryFailed(id);
    const broadcast = await loadBroadcast(id);
    return NextResponse.json({ data: { broadcast, progress } });
  } catch (error) {
    return newsError(error);
  }
});
