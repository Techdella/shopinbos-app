import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { ProductVisibilitySchema, SalesChannelSchema } from "@/lib/schemas";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth/types";

const VisibilityUpdateSchema = z.object({
  visibility: ProductVisibilitySchema.optional(),
  salesChannel: SalesChannelSchema.optional(),
});

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
  const parsed = VisibilityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (!parsed.data.visibility && !parsed.data.salesChannel) {
    return apiError("BAD_REQUEST", "Provide at least one of visibility or salesChannel");
  }

  const updated = await db.storeProduct.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return ok(updated);
});
