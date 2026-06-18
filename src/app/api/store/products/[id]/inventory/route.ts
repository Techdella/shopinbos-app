import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { InventoryUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

async function getOwnedProduct(productId: string, userId: string) {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return null;
  return db.storeProduct.findUnique({
    where: { id: productId, storeId: store.id },
  });
}

export const PATCH = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = InventoryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { note, ...stockFields } = parsed.data;

  const oldStock = product.currentStock;
  const newStock = stockFields.currentStock;
  const stockChange = newStock - oldStock;

  const store = await db.store.findUnique({ where: { userId: user.id } });

  const [updated] = await db.$transaction([
    db.storeProduct.update({
      where: { id: params.id },
      data: stockFields,
    }),
    ...(stockChange !== 0
      ? [
          db.stockMovement.create({
            data: {
              storeId: store!.id,
              productId: params.id,
              change: stockChange,
              type: stockChange > 0 ? "addition" : "removal",
              note: note ?? `Inventory updated from ${oldStock} to ${newStock}`,
            },
          }),
        ]
      : []),
  ]);

  return ok({
    ...updated,
    available: updated.currentStock - updated.reservedStock,
  });
});
