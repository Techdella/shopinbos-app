import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { endStorePreorders, sellerWholesaleRows, storePreorders, storeStockReady } from "@/lib/supplier-orders/preorders.server";
import { cancelStoreOrderForUnpaidBalance, markStoreBalancePaidOffline } from "@/lib/commerce/store-balance.server";

export const dynamic = "force-dynamic";

// The seller's preorders (phone + web; src/lib/supplier-orders/preorders.server.ts):
//   GET ?view=suppliers → { orders }: their bulk preorders from suppliers (stage, deposit, balance due, Pay).
//   GET ?view=shop (default) → { groups }: their store's open preorders from shoppers, by product (each order's
//        stage, incl. "balance_due" with what's owed, when it's due and whether it's overdue).
//   POST { productId, action: "ready", end? } → "Stock is ready" on their product: the orders paid in full move to
//        processing (the usual status change tells the customer); shoppers who paid a deposit are asked for the rest
//        (email + SMS); `end` stops taking preorders too.
//   POST { productId, action: "end" } → stop taking preorders on the product.
//   POST { orderId, action: "balance_paid" } → the shopper paid the rest another way (src/lib/commerce/store-balance.server.ts).
//   POST { orderId, action: "cancel_unpaid" } → the rest wasn't paid in time: cancel; the deposit is owed back.

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ready"), productId: z.string().min(1).max(40), end: z.boolean().optional() }),
  z.object({ action: z.literal("end"), productId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("balance_paid"), orderId: z.string().min(1).max(40) }),
  z.object({ action: z.literal("cancel_unpaid"), orderId: z.string().min(1).max(40) }),
]);

async function storeOf(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, name: true } });
}

export const GET = withSeller(async (req: NextRequest, { user }) => {
  if (req.nextUrl.searchParams.get("view") === "suppliers") return ok({ orders: await sellerWholesaleRows(user.id, { onlyPreorders: true }) });
  const store = await storeOf(user.id);
  if (!store) return ok({ groups: [] });
  return ok(await storePreorders(store.id));
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await storeOf(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which product or order and what to do.");
  const body = parsed.data;
  if (body.action === "balance_paid" || body.action === "cancel_unpaid") {
    const result = body.action === "balance_paid" ? await markStoreBalancePaidOffline(store, body.orderId) : await cancelStoreOrderForUnpaidBalance(store, body.orderId);
    if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
    return ok({ message: result.message, ...(await storePreorders(store.id)) });
  }
  const result = body.action === "ready" ? await storeStockReady(store, body.productId, { end: body.end }) : await endStorePreorders(store.id, body.productId);
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
  return ok({ ...result.data, ...(await storePreorders(store.id)) });
});
