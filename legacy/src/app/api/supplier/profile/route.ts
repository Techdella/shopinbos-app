import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { SupplierUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSupplier(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({
    where: { userId: user.id },
    include: { _count: { select: { products: true, quoteRequests: true, wholesaleOrders: true } } },
  });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  return ok(supplier);
});

export const PATCH = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = SupplierUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const updated = await db.supplier.update({ where: { id: supplier.id }, data: parsed.data });
  invalidatePublicMarketplaceCache({ supplierSlug: updated.slug });
  return ok(updated);
});
