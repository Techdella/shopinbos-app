import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { WHOLESALE_SELECT, dropshipOrders, supplierForUser, wholesaleView } from "../_shared";

export const dynamic = "force-dynamic";

// Supplier orders for the mobile app: dropship orders (sellers' store orders with the supplier's products, packed
// with the shop's label) and wholesale orders. ?view=open (default) | done. Moving one: PATCH ./[id].

const OPEN_WHOLESALE = ["pending", "confirmed", "processing"] as const;
const DONE_WHOLESALE = ["shipped", "delivered", "cancelled", "refunded"] as const;

export const GET = withSupplier(async (req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const view = req.nextUrl.searchParams.get("view") === "done" ? "done" : "open";

  const [dropship, wholesale, openWholesale] = await Promise.all([
    dropshipOrders(supplier.id),
    db.wholesaleOrder.findMany({
      where: { supplierId: supplier.id, status: { in: view === "open" ? [...OPEN_WHOLESALE] : [...DONE_WHOLESALE] } },
      orderBy: { createdAt: view === "open" ? "asc" : "desc" },
      take: 60,
      select: WHOLESALE_SELECT,
    }),
    db.wholesaleOrder.count({ where: { supplierId: supplier.id, status: { in: [...OPEN_WHOLESALE] } } }),
  ]);

  const openDropship = dropship.filter((order) => ["paid", "pending", "awaiting_payment", "processing", "packed"].includes(order.status));
  return ok({
    view,
    dropship: view === "open" ? [...openDropship].reverse() : dropship.filter((order) => !openDropship.includes(order)).slice(0, 60),
    wholesale: wholesale.map(wholesaleView),
    counts: { dropship: openDropship.length, wholesale: openWholesale },
  });
});
