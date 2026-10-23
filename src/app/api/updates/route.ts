import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { liveUpdatesFor } from "@/lib/weekly-updates.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/updates — this week's updates from the Shopinbos team for the signed-in seller, supplier or delivery
// partner, in the order they play, each with `seen`. Empty for other roles (and before the migration has run).
export const GET = withAuth(async (_req, { user }) => {
  const role = user.role === "seller" || user.role === "supplier" || user.role === "logistics_partner" ? user.role : null;
  const data = role ? await liveUpdatesFor(role, user.id) : [];
  return NextResponse.json({ data, meta: { page: 1, limit: data.length, total: data.length } }, { headers: { "Cache-Control": "private, no-store" } });
});
