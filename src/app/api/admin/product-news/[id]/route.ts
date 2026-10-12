import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { newsError, parseNewsInput } from "@/lib/email/product-news.api";
import { BROADCAST_SELECT, deleteDraft, unscheduleBroadcast, updateBroadcast } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/product-news/:id — one email with its progress (sent, failed, skipped)
export const GET = withAdmin(async (_req: NextRequest, { params }) => {
  const broadcast = await db.productNewsBroadcast.findUnique({ where: { id: String(params.id) }, select: BROADCAST_SELECT });
  return broadcast ? NextResponse.json({ data: broadcast }) : apiError("NOT_FOUND", "Not found", 404);
});

// PATCH /api/admin/product-news/:id — edit a draft or scheduled email; { "unschedule": true } turns it back into a draft
export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const id = String(params.id);
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError("BAD_REQUEST", "Invalid JSON body", 400);
    }
    if (raw && typeof raw === "object" && (raw as { unschedule?: unknown }).unschedule === true) return NextResponse.json({ data: await unscheduleBroadcast(id) });
    const input = parseNewsInput(raw);
    if ("error" in input) return input.error;
    return NextResponse.json({ data: await updateBroadcast(id, input.data) });
  } catch (error) {
    return newsError(error);
  }
});

// DELETE /api/admin/product-news/:id — delete a draft
export const DELETE = withAdmin(async (_req: NextRequest, { params }) => {
  try {
    await deleteDraft(String(params.id));
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return newsError(error);
  }
});
