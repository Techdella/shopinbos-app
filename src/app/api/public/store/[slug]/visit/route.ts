import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";

// Storefront visit beacon: refreshes StoreVisitor.lastSeenAt so the seller dashboard can count visitors today.
const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({ visitorKey: z.string().min(8).max(80) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Missing visitor key"), CORS);
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  await upsertStoreVisitor({ storeId: store.id, visitorKey: parsed.data.visitorKey });
  return withCors(req, ok({ counted: true }), CORS);
}
