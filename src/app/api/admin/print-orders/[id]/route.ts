import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { notifySellerOfStatus } from "@/lib/packaging/print-orders.server";
import { PrintOrderUpdateSchema } from "@shared/print-orders";

export const dynamic = "force-dynamic";

// /admin/print-orders: move an order along (printing, shipped with tracking, delivered); the seller is emailed when
// it ships and when it's delivered.
export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = PrintOrderUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Check the status.");
  const row = await db.printOrder.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!row) return apiError("NOT_FOUND", "Order not found", 404);
  const updated = await db.printOrder.update({ where: { id }, data: parsed.data, omit: { design: true } });
  if (parsed.data.status && parsed.data.status !== row.status) await notifySellerOfStatus(id).catch((error) => console.error("[print-orders] seller email failed", error));
  return ok(updated);
});
