import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { verificationFileAllowed } from "@/lib/security/private-files";
import { getSignedUrl } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opens a verification document (ID, CAC certificate, bank letter…): the supplier or delivery partner it
// belongs to, or an admin, gets a 5-minute signed link. These files are never linked by public URL.
export const GET = withAuth(async (req, { user }) => {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  const owner =
    user.role === "supplier"
      ? await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } })
      : user.role === "logistics_partner"
        ? await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true } })
        : null;
  if (!verificationFileAllowed(path, { role: user.role, ownerId: owner?.id ?? null })) return apiError("NOT_FOUND", "File not found.", 404);
  try {
    const response = NextResponse.redirect(await getSignedUrl(path, 300), 302);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return apiError("NOT_FOUND", "File not found.", 404);
  }
}, ["supplier", "logistics_partner", "admin"]);
