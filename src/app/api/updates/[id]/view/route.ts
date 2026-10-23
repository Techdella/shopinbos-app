import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/middleware";
import { liveUpdatesFor, markUpdateSeen } from "@/lib/weekly-updates.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/updates/:id/view — the signed-in person has seen this update (only live updates for their role count).
export const POST = withAuth(async (_req, { user, params }) => {
  const id = String(params.id ?? "");
  const role = user.role === "seller" || user.role === "supplier" || user.role === "logistics_partner" ? user.role : null;
  if (!role) return NextResponse.json({ data: { id, seen: false } });
  const live = await liveUpdatesFor(role, user.id);
  if (!live.some((update) => update.id === id)) return apiError("NOT_FOUND", "That update isn't showing any more.", 404);
  await markUpdateSeen(id, user.id);
  return NextResponse.json({ data: { id, seen: true } });
});
