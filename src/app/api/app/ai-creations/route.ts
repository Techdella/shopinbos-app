import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { aiCreationKind } from "@shared/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rex's History > Creations: the logos, pictures, edited photos and banners Rex and the studios made (they are
// saved to the media library as source "ai"), newest first. GET ?kind=logo|image|edit|banner&limit=1-60.

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const kind = req.nextUrl.searchParams.get("kind");
  const limit = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 30));
  const folder = kind === "logo" ? "logos/" : kind === "banner" ? "banners/" : kind === "edit" ? "enhanced/" : kind === "image" ? "generated/" : null;
  const rows = await db.mediaAsset.findMany({
    where: { userId: user.id, source: "ai", hiddenAt: null, ...(folder ? { path: { startsWith: folder } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, url: true, path: true, kind: true, createdAt: true },
  });
  return ok(rows.map((row) => ({ id: row.id, url: row.url, kind: row.kind === "video" ? "video" : aiCreationKind(row.path), createdAt: row.createdAt.toISOString() })));
});
