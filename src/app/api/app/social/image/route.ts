import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { appOrigin } from "@/lib/ads";
import { safeFetch } from "@/lib/security/safe-fetch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

// Downloads one of the seller's own product photos as a file (same origin, so the browser saves it instead of
// opening it), for posting to Instagram or TikTok, which have no web share page.
export const GET = withSeller(async (req, { user }) => {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") ?? "";
  const index = Math.max(0, Math.min(10, Number(url.searchParams.get("i") ?? 0) || 0));
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const product = await db.storeProduct.findFirst({ where: { id: productId, storeId: store.id }, select: { name: true, images: true } });
  const source = product?.images[index];
  if (!product || !source) return apiError("NOT_FOUND", "That product has no photo", 404);

  // Our own uploads are fetched as-is; seller-entered URLs only from public http(s) hosts, checked after DNS
  // and on every redirect.
  const own = source.startsWith("/") && !source.startsWith("//");
  const signal = AbortSignal.timeout(20_000);
  const response = await (own ? fetch(`${appOrigin()}${source}`, { signal }) : safeFetch(source, { signal })).catch(() => null);
  const type = response?.headers.get("content-type") ?? "";
  if (!response?.ok || !type.startsWith("image/")) return apiError("BAD_REQUEST", "Couldn't fetch that photo", 502);
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return apiError("BAD_REQUEST", "That photo is too large to download here", 413);

  const extension = type.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "jpg";
  const name = `${product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "product"}.${extension}`;
  return new NextResponse(body, {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, max-age=300" },
  });
});
