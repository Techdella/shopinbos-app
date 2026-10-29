import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { reviewRequestMessage } from "@/lib/reviews/pure";
import { requestReviews } from "@/lib/reviews/requests";
import { reviewUrls } from "@/lib/reviews/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// "Ask for a review" in the mobile app, sent from the seller's own phone (the web's "From my WhatsApp" option).
//   GET  → { wall, orders }: the reviews wall link and recent paid orders, newest first.
//   POST { orderId } → { link, message, whatsappUrl }: a signed review link for that order and the message to
//        share it with (recorded as a review request, like the web).

const REQUESTABLE = ["paid", "processing", "packed", "shipped", "delivered"] as const;

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true, customDomain: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const orders = await db.retailOrder.findMany({
    where: { storeId: store.id, status: { in: [...REQUESTABLE] }, createdAt: { gte: new Date(Date.now() - 120 * 86_400_000) } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, orderNumber: true, buyerName: true, buyerPhone: true, status: true, createdAt: true, deliveredAt: true },
  });
  return ok({
    wall: reviewUrls(store).wall,
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.buyerName,
      hasPhone: Boolean(order.buyerPhone),
      status: order.status,
      at: (order.deliveredAt ?? order.createdAt).toISOString(),
    })),
  });
});

const Body = z.object({ orderId: z.string().min(1).max(64) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Choose an order.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  try {
    const result = await requestReviews({ storeId: store.id, orderIds: [parsed.data.orderId], channel: "link", trigger: "manual", resend: true });
    const outcome = result.results[0];
    if (!outcome || outcome.status !== "link" || !outcome.link) return apiError("BAD_REQUEST", outcome?.reason ?? "Couldn't make a review link for this order.");
    return ok({ link: outcome.link, message: reviewRequestMessage({ storeName: store.name, customerName: outcome.customerName, link: outcome.link }).text, whatsappUrl: outcome.whatsappUrl ?? null });
  } catch (error) {
    return apiError("UNAVAILABLE", error instanceof Error ? error.message : "Couldn't make a review link.", 503);
  }
});
