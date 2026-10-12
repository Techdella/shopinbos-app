import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, created, apiError } from "@/lib/api/response";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";
import { overPublicLimit } from "@/lib/rate-limit";

const CORS = { methods: ["GET", "POST", "DELETE", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const WishlistSchema = z.object({
  visitorKey: z.string().min(8),
  productId: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

async function resolveStore(slug: string) {
  return db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await resolveStore(slug);
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const visitorKey = req.nextUrl.searchParams.get("visitorKey") ?? "";
  const parsed = z.string().min(8).safeParse(visitorKey);
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Missing visitor key"), CORS);

  const visitorId = await upsertStoreVisitor({ storeId: store.id, visitorKey });
  const items = visitorId
    ? await db.$queryRawUnsafe<Array<{ productId: string }>>(
        `SELECT "productId" FROM "StoreWishlistItem" WHERE "storeId" = $1 AND "visitorId" = $2 ORDER BY "createdAt" DESC`,
        store.id,
        visitorId,
      )
    : [];
  return withCors(req, ok({ productIds: items.map((item) => item.productId) }), CORS);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (overPublicLimit(req.headers, "wishlist")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const store = await resolveStore(slug);
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const body = await req.json().catch(() => null);
  const parsed = WishlistSchema.safeParse(body);
  if (!parsed.success || !parsed.data.productId) return withCors(req, apiError("BAD_REQUEST", "Missing wishlist product"), CORS);

  const product = await db.storeProduct.findFirst({ where: { id: parsed.data.productId, storeId: store.id }, select: { id: true } });
  if (!product) return withCors(req, apiError("NOT_FOUND", "Product not found", 404), CORS);

  const visitorId = await upsertStoreVisitor({ storeId: store.id, visitorKey: parsed.data.visitorKey, email: parsed.data.email, name: parsed.data.name });
  await db.$executeRawUnsafe(
    `
      INSERT INTO "StoreWishlistItem" (id, "storeId", "visitorId", "productId")
      VALUES (gen_random_uuid()::text, $1, $2, $3)
      ON CONFLICT ("visitorId", "productId") DO NOTHING
    `,
    store.id,
    visitorId,
    product.id,
  );

  return withCors(req, created({ productId: product.id }), CORS);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (overPublicLimit(req.headers, "wishlist")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const store = await resolveStore(slug);
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const body = await req.json().catch(() => null);
  const parsed = WishlistSchema.safeParse(body);
  if (!parsed.success || !parsed.data.productId) return withCors(req, apiError("BAD_REQUEST", "Missing wishlist product"), CORS);

  const visitorId = await upsertStoreVisitor({ storeId: store.id, visitorKey: parsed.data.visitorKey });
  await db.$executeRawUnsafe(
    `DELETE FROM "StoreWishlistItem" WHERE "storeId" = $1 AND "visitorId" = $2 AND "productId" = $3`,
    store.id,
    visitorId,
    parsed.data.productId,
  );

  return withCors(req, ok({ productId: parsed.data.productId }), CORS);
}
