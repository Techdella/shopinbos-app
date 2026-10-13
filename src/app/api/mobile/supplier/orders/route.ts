import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { DROPSHIP_DONE, DROPSHIP_OPEN } from "../_rules";
import { WHOLESALE_SELECT, dropshipOrders, supplierForUser, wholesaleViews } from "../_shared";

export const dynamic = "force-dynamic";

// Supplier orders for the mobile app: dropship orders (what they ship for shops' orders, packed with the shop's
// label) and wholesale orders. ?view=open (default) | done. Moving one: PATCH ./[id].

const OPEN_WHOLESALE = ["pending", "confirmed", "processing"] as const;
const DONE_WHOLESALE = ["shipped", "delivered", "cancelled", "refunded"] as const;

export const GET = withSupplier(async (req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const view = req.nextUrl.searchParams.get("view") === "done" ? "done" : "open";

  const [dropship, wholesale, openDropship, openWholesale] = await Promise.all([
    view === "open"
      ? dropshipOrders(supplier.id, { statuses: DROPSHIP_OPEN, order: "asc", take: 60 })
      : dropshipOrders(supplier.id, { statuses: DROPSHIP_DONE, take: 60 }),
    db.wholesaleOrder.findMany({
      where: { supplierId: supplier.id, status: { in: view === "open" ? [...OPEN_WHOLESALE] : [...DONE_WHOLESALE] } },
      orderBy: { createdAt: view === "open" ? "asc" : "desc" },
      take: 60,
      select: WHOLESALE_SELECT,
    }),
    db.supplierOrder.count({ where: { supplierId: supplier.id, status: { in: [...DROPSHIP_OPEN] } } }),
    db.wholesaleOrder.count({ where: { supplierId: supplier.id, status: { in: [...OPEN_WHOLESALE] } } }),
  ]);

  return ok({
    view,
    dropship,
    wholesale: await wholesaleViews(wholesale),
    counts: { dropship: openDropship, wholesale: openWholesale },
  });
});
