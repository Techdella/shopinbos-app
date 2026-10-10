import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { CartSettingsUpdateSchema } from "@/lib/schemas";

export const GET = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { brandSettings: true },
  });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const settings = (store.brandSettings as Record<string, unknown>) ?? {};
  const cartConfig = (settings.cartConfig as Record<string, unknown>) ?? {};

  return ok({
    addToCartLabel: cartConfig.addToCartLabel ?? "add_to_cart",
    addToCartBehavior: cartConfig.addToCartBehavior ?? "drawer",
    cartStyle: cartConfig.cartStyle ?? "right-drawer",
    enableWishlist: cartConfig.enableWishlist !== false,
  });
});

export const PATCH = withSeller(async (req, { user }) => {
  const parsed = await parseBody(CartSettingsUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, brandSettings: true },
  });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const currentSettings = (store.brandSettings as Record<string, unknown>) ?? {};
  const currentCartConfig = (currentSettings.cartConfig as Record<string, unknown>) ?? {};

  const updatedCartConfig = {
    ...currentCartConfig,
    ...parsed.data,
  };

  await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: {
        ...currentSettings,
        cartConfig: updatedCartConfig,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return ok(updatedCartConfig);
});
