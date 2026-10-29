import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { REQUEST_CHANNELS, requestReach } from "@/lib/reviews/pure";
import { requestableOrders, requestReviews, storeChannelReadiness } from "@/lib/reviews/requests";
import { reviewUrls } from "@/lib/reviews/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Ask for reviews now, in the app (the web's /home/reviews/request form, src/app/actions/reviews.ts
// sendReviewRequests). Both use src/lib/reviews/requests.ts.
//   GET  → { wall, ready, orders }: the reviews wall link, which ways are set up, and the recent paid-or-later
//        orders with who can be reached how, when each was last asked and whether they already reviewed.
//   POST { orderIds, channel, resend? } → { sent, failed, skipped, results }: sends (or, for "link", prepares
//        wa.me links to send from the seller's own WhatsApp).

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true, customDomain: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const [{ orders }, ready] = await Promise.all([requestableOrders(store.id, 200), storeChannelReadiness(store.id)]);
  return ok({
    wall: reviewUrls(store).wall,
    ready,
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.buyerName,
      status: order.status,
      at: (order.deliveredAt ?? order.createdAt).toISOString(),
      reach: requestReach(order),
      asked: order.asked ? { channel: order.asked.channel, at: order.asked.at.toISOString() } : null,
      reviewed: order.reviewed,
    })),
  });
});

const Body = z.object({
  orderIds: z.array(z.string().min(1).max(64)).min(1, "Choose at least one order.").max(200),
  channel: z.enum(REQUEST_CHANNELS),
  resend: z.boolean().optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message === "Choose at least one order." ? "Choose at least one order." : "Choose the orders and how to ask.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  try {
    const result = await requestReviews({ storeId: store.id, orderIds: parsed.data.orderIds, channel: parsed.data.channel, trigger: "manual", resend: parsed.data.resend === true });
    revalidatePath("/home/reviews", "layout");
    return ok({ sent: result.sent, failed: result.failed, skipped: result.skipped, results: result.results });
  } catch (error) {
    return apiError("UNAVAILABLE", error instanceof Error ? error.message : "Couldn't send the requests.", 503);
  }
});
