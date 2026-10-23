import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { isMissingTable } from "@/lib/rate-limit-core";
import { UPDATE_SELECT, UPDATES_MIGRATION, UpdateInput, adminUpdateRows, toAdminRow, updateMediaProblem } from "@/lib/weekly-updates.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/updates — every weekly update, drafts and ended ones included, with view counts (admin only).
export const GET = withAdmin(async () => {
  try {
    const data = await adminUpdateRows();
    return NextResponse.json({ data, meta: { page: 1, limit: data.length, total: data.length } });
  } catch (error) {
    if (isMissingTable(error)) return apiError("MIGRATION_NEEDED", UPDATES_MIGRATION, 503);
    throw error;
  }
});

// POST /api/admin/updates — create an update (text, motion, image or video).
export const POST = withAdmin(async (req: NextRequest, { user }) => {
  const parsed = UpdateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form.", 422);
  const problem = await updateMediaProblem(parsed.data);
  if (problem) return apiError("INVALID_MEDIA", problem, 422);
  try {
    const row = await db.weeklyUpdate.create({ data: { ...parsed.data, createdById: user.id }, select: UPDATE_SELECT });
    return NextResponse.json({ data: toAdminRow(row) }, { status: 201 });
  } catch (error) {
    if (isMissingTable(error)) return apiError("MIGRATION_NEEDED", UPDATES_MIGRATION, 503);
    throw error;
  }
});
