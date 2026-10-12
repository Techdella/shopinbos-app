import { NextRequest } from "next/server";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { loadPublicStore } from "@/lib/storefront/public-store.server";

// The query and shaping live in loadPublicStore, which the storefront pages call directly.

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadPublicStore(slug);

  if (result.kind === "missing") return withCors(req, apiError("NOT_FOUND", "Store not found", 404));
  if (result.kind === "unavailable") {
    return withCors(req, apiError("NOT_FOUND", result.reason === "inactive" ? "Store not available" : "Store not published", 404));
  }
  return withCors(req, ok(result.store));
}
