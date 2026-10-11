import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordStoreMetric } from "@/lib/analytics/record";
import { isBotUserAgent, normalizeSource } from "@/lib/analytics/sources";

// Storefront funnel beacon (product views, add to bag, checkout started). Visits are counted by ../visit.
// Counts only: no personal data is stored. Sent by src/lib/analytics/storefront-events.ts.
const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({
  type: z.enum(["product_view", "add_to_cart", "checkout_start"]),
  productId: z.string().min(1).max(64).optional(),
  ref: z.string().max(64).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Unknown event"), CORS);
  if (isBotUserAgent(req.headers.get("user-agent"))) return withCors(req, ok({ counted: false }), CORS);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(`store-events:${slug}:${ip}`, { maxRequests: 120, windowMs: 60_000 }).allowed) {
    return withCors(req, ok({ counted: false }), CORS);
  }

  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  let productId = "";
  if (parsed.data.productId) {
    const product = await db.storeProduct.findFirst({ where: { id: parsed.data.productId, storeId: store.id }, select: { id: true } });
    if (!product) return withCors(req, ok({ counted: false }), CORS);
    productId = product.id;
  }

  await recordStoreMetric(store.id, parsed.data.type, { channel: normalizeSource(parsed.data.ref), productId });
  return withCors(req, ok({ counted: true }), CORS);
}
