import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, created, apiError } from "@/lib/api/response";
import { z } from "zod";

const CORS = { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const SubmitReviewSchema = z.object({
  productId: z.string().min(1),
  orderId: z.string().min(1),
  buyerName: z.string().min(1),
  buyerEmail: z.string().email(),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional().default(""),
  body: z.string().optional().default(""),
  images: z.array(z.string()).optional().default([]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const store = await db.store.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!store || store.status !== "active") {
    return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  }

  const body = await req.json().catch(() => null);
  if (!body) return withCors(req, apiError("BAD_REQUEST", "Invalid JSON body"), CORS);

  const parsed = SubmitReviewSchema.safeParse(body);
  if (!parsed.success) {
    return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body"), CORS);
  }

  const { productId, orderId, buyerName, buyerEmail, rating, title, body: reviewBody, images } = parsed.data;

  const order = await db.retailOrder.findFirst({
    where: { id: orderId, storeId: store.id, buyerEmail },
    select: { id: true },
  });
  if (!order) {
    return withCors(req, apiError("FORBIDDEN", "Order not found for this buyer", 403), CORS);
  }

  const product = await db.storeProduct.findFirst({
    where: { id: productId, storeId: store.id },
    select: { id: true },
  });
  if (!product) {
    return withCors(req, apiError("NOT_FOUND", "Product not found", 404), CORS);
  }

  await db.$executeRawUnsafe(
    `INSERT INTO "ProductReview" (id, "storeId", "productId", "orderId", "buyerName", "buyerEmail", rating, title, body, images, status)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
    store.id, productId, orderId, buyerName, buyerEmail, rating, title, reviewBody, images,
  );

  return withCors(req, created({ success: true }), CORS);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  const store = await db.store.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!store) {
    return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  }

  const reviews = await db.$queryRawUnsafe<Array<{
    id: string; productId: string; buyerName: string; rating: number;
    title: string; body: string; sellerReply: string; repliedAt: Date | null;
    createdAt: Date;
  }>>(
    `SELECT id, "productId", "buyerName", rating, title, body, "sellerReply", "repliedAt", "createdAt"
     FROM "ProductReview"
     WHERE "storeId" = $1${productId ? ` AND "productId" = $2` : ""} AND status = 'approved'
     ORDER BY "createdAt" DESC
     LIMIT 50`,
    productId ? [store.id, productId] : [store.id],
  );

  return withCors(req, ok({ reviews }), CORS);
}
