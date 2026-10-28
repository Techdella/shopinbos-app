import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { overPublicLimit } from "@/lib/rate-limit";
import { cancelLatePart } from "@/lib/faults/customer.server";

// "Cancel this part for a full refund" on the store's order page, once a supplier's parcel is past its ship-by date
// and not sent (shared/fault-matrix.ts row 2). Access matches the order page: the order's unguessable id. The
// refund goes through the refund route; the supplier's pay goes back to the shop as money owed. Safe to press twice.
//   POST { supplierOrderId } → { data: { message } }

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({ supplierOrderId: z.string().min(1).max(64) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  if (await overPublicLimit(req.headers, "form")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug, orderId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !orderId || orderId.length > 64) return withCors(req, apiError("BAD_REQUEST", "Pick the part to cancel."), CORS);
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const result = await cancelLatePart(store.id, orderId, parsed.data.supplierOrderId);
  if (!result.ok) return withCors(req, apiError("CONFLICT", result.error, 409), CORS);
  return withCors(req, ok({ message: result.message }), CORS);
}
