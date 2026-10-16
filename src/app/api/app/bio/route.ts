import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { loadSellerBio, saveBioPage } from "@/lib/bio/service.server";

// The seller's link in bio page: read it for the editor, and save it (checked in saveBioPage: own products and
// collections only, safe links, "Buy now" blocks get a reusable payment link).

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true, description: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await loadSellerBio(store));
});

export const PUT = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const result = await saveBioPage(store.id, await req.json().catch(() => null));
  if (!result.ok) {
    // The editor marks the block the refusal is about (error.blockIndex, error.field) next to its message.
    if (result.blockIndex === undefined) return apiError("BAD_REQUEST", result.message);
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: result.message, blockIndex: result.blockIndex, field: result.field ?? "other" } }, { status: 400 });
  }
  return ok(result.page);
});
