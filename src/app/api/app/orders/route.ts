import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { created, okList, apiError } from "@/lib/api/response";
import { orderRow } from "@/lib/dashboard/compute";
import { recordSale, RecordSaleError, RecordSaleSchema } from "@/lib/orders/record-sale";

export const GET = withSeller(async (req, { user }) => {
  const url = new URL(req.url);
  const page  = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1",  10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
  const status = url.searchParams.get("status") ?? undefined;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const where = {
    storeId: store.id,
    ...(status ? { status: status as any } : {}),
  };

  const [total, orders] = await Promise.all([
    db.retailOrder.count({ where }),
    db.retailOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // `row` carries the plain-language stage and payment labels the apps show (same as the web dashboard).
  return okList(
    orders.map((order) => ({ ...order, row: orderRow({ ...order, total: Number(order.total) }) })),
    { page, limit, total },
  );
});

/** Record a sale made off the storefront (WhatsApp, Instagram, in person). */
export const POST = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const parsed = RecordSaleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the sale details");

  try {
    const order = await recordSale(store.id, parsed.data);
    return created({ ...order, row: orderRow({ ...order, total: Number(order.total) }) });
  } catch (error) {
    if (error instanceof RecordSaleError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
