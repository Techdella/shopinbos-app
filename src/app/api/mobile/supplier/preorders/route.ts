import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { endSupplierPreorders, supplierPreorders, supplierStockReady } from "@/lib/supplier-orders/preorders.server";
import { supplierForUser } from "../_shared";

export const dynamic = "force-dynamic";

// The supplier's preorders (phone app; src/lib/supplier-orders/preorders.server.ts):
//   GET  → { groups }: open bulk preorders by product (ship date, units / cap, shops, deposit paid and balance due
//          per shop), plus products taking preorders with none yet.
//   POST { productId, action: "ready", end? } → "Stock is ready": marks the open preorders ready and tells each shop
//          (pay the rest, or it ships now); `end` stops taking preorders too.
//   POST { productId, action: "end" } → stop taking preorders for the product.

const Body = z.object({
  productId: z.string().min(1).max(40),
  action: z.enum(["ready", "end"]),
  end: z.boolean().optional(),
});

export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  return ok(await supplierPreorders(supplier.id));
});

export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which product and what to do.");
  const result = parsed.data.action === "ready" ? await supplierStockReady(supplier.id, parsed.data.productId, { end: parsed.data.end }) : await endSupplierPreorders(supplier.id, parsed.data.productId);
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
  return ok({ ...result.data, ...(await supplierPreorders(supplier.id)) });
});
