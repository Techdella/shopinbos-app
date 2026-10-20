import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { overPublicLimit } from "@/lib/rate-limit";
import { reportDeliveryIssue } from "@/lib/delivery-market/manage.server";
import { ISSUE_KINDS } from "@shared/delivery-market";

// "Report a problem" on the store's order page (Logistics marketplace spec §6.4): late, not delivered, damaged or the
// wrong item. Tells the seller, and the delivery partner for delivery problems (reportDeliveryIssue).
// Access matches the order page itself: anyone with the order's link (its unguessable id) can see the order, so the
// same id, for an order of this store, can report on it. Rate limited per IP, and at most 5 reports per order a day.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const IssueSchema = z.object({
  kind: z.enum(ISSUE_KINDS, { message: "Pick what went wrong." }),
  message: z.string().trim().max(1000).optional(),
  name: z.string().trim().max(80).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  if (await overPublicLimit(req.headers, "form")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug, orderId } = await params;
  if (!orderId || orderId.length > 64) return withCors(req, apiError("NOT_FOUND", "We couldn't find this order.", 404), CORS);

  const parsed = IssueSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Pick what went wrong."), CORS);

  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  // The order must belong to this store (reportDeliveryIssue checks it again).
  const order = await db.retailOrder.findFirst({ where: { id: orderId, storeId: store.id }, select: { id: true, status: true } });
  if (!order) return withCors(req, apiError("NOT_FOUND", "We couldn't find this order.", 404), CORS);
  if (order.status === "cancelled") return withCors(req, apiError("BAD_REQUEST", "This order was cancelled. Contact the store if you need help."), CORS);

  const result = await reportDeliveryIssue({ orderId: order.id, storeId: store.id, kind: parsed.data.kind, message: parsed.data.message, reporterName: parsed.data.name });
  if (!result.ok) return withCors(req, apiError("BAD_REQUEST", result.error), CORS);
  return withCors(req, ok({ reported: true }), CORS);
}
