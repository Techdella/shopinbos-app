import { NextRequest, NextResponse } from "next/server";
import { findStoreByHandle, shopLinkTarget } from "@/lib/shop-handle.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /h/:handle, and the short link /@:handle (the proxy rewrites it here): a shop's short link and QR code
// (shared/shop-handle.ts). Public, no sign-in. Where it goes is decided by shopLinkTarget alone: the shop's website
// today, Plug (or the Play Store) once Plug ships. A temporary redirect (302) so that change reaches links already
// printed, and nothing caches it. An unknown handle gets a plain 404.
export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const store = await findStoreByHandle(decodeURIComponent(handle)).catch(() => null);
  if (!store) {
    return new NextResponse("We couldn't find a shop with that link.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=60" } });
  }
  const response = NextResponse.redirect(shopLinkTarget(store, { userAgent: req.headers.get("user-agent") }), 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
