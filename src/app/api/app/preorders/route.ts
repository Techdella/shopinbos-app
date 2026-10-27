import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { endStorePreorders, sellerWholesaleRows, storePreorders, storeStockReady } from "@/lib/supplier-orders/preorders.server";

export const dynamic = "force-dynamic";

// The seller's preorders (phone + web; src/lib/supplier-orders/preorders.server.ts):
//   GET ?view=suppliers → { orders }: their bulk preorders from suppliers (stage, deposit, balance due, Pay).
//   GET ?view=shop (default) → { groups }: their store's open preorders from shoppers, by product.
//   POST { productId, action: "ready", end? } → "Stock is ready" on their product: the paid orders move to
//        processing (the usual status change tells the customer); `end` stops taking preorders too.
//   POST { productId, action: "end" } → stop taking preorders on the product.

const Body = z.object({
  productId: z.string().min(1).max(40),
  action: z.enum(["ready", "end"]),
  end: z.boolean().optional(),
});

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
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which product and what to do.");
  const result = parsed.data.action === "ready" ? await storeStockReady(store, parsed.data.productId, { end: parsed.data.end }) : await endStorePreorders(store.id, parsed.data.productId);
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
  return ok({ ...result.data, ...(await storePreorders(store.id)) });
});
