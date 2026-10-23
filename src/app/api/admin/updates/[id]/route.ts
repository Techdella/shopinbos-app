import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { UPDATE_SELECT, UpdateInput, removeUpdateFile, toAdminRow, updateMediaProblem } from "@/lib/weekly-updates.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/updates/:id — save changes (the whole form). DELETE — remove it, its views and its uploaded files.
export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const id = String(params.id ?? "");
  const existing = await db.weeklyUpdate.findUnique({ where: { id }, select: UPDATE_SELECT });
  if (!existing) return apiError("NOT_FOUND", "That update isn't there any more.", 404);
  const parsed = UpdateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form.", 422);
  const problem = await updateMediaProblem(parsed.data, existing);
  if (problem) return apiError("INVALID_MEDIA", problem, 422);
  const row = await db.weeklyUpdate.update({ where: { id }, data: parsed.data, select: UPDATE_SELECT });
  if (existing.mediaUrl !== row.mediaUrl) await removeUpdateFile(existing.mediaUrl);
  if (existing.posterUrl !== row.posterUrl) await removeUpdateFile(existing.posterUrl);
  const views = await db.weeklyUpdateView.count({ where: { updateId: id } });
  return NextResponse.json({ data: toAdminRow(row, views) });
});

export const DELETE = withAdmin(async (_req: NextRequest, { params }) => {
  const id = String(params.id ?? "");
  const existing = await db.weeklyUpdate.findUnique({ where: { id }, select: UPDATE_SELECT });
  if (!existing) return apiError("NOT_FOUND", "That update isn't there any more.", 404);
  await db.weeklyUpdate.delete({ where: { id } });
  await Promise.all([removeUpdateFile(existing.mediaUrl), removeUpdateFile(existing.posterUrl)]);
  return NextResponse.json({ data: { id } });
});
