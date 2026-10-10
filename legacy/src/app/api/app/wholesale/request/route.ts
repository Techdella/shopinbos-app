import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { WholesaleOrderCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = WholesaleOrderCreateSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supplierId, supplierProductId, quantity, deliveryAddress, notes } = parsed.data;

  const [supplier, product] = await Promise.all([
    db.supplier.findFirst({
      where: { id: supplierId, status: "active", verificationStatus: "verified" },
    }),
    db.supplierProduct.findFirst({
      where: {
        id: supplierProductId,
        supplierId,
        status: "published",
        bulkOrderAvailable: true,
      },
    }),
  ]);

  if (!supplier) return apiError("NOT_FOUND", "Supplier not found", 404);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);
  if (quantity < product.moq) {
    return apiError("BAD_REQUEST", `Minimum order quantity is ${product.moq}`, 400);
  }

  const unitPrice = product.wholesalePrice;
  const order = await db.wholesaleOrder.create({
    data: {
      sellerId: user.id,
      supplierId,
      supplierProductId,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      currency: product.currency,
      deliveryAddress,
      notes,
    },
  });

  return ok(order, 201);
});
