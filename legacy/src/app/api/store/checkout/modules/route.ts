import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { CheckoutModulesUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const PATCH = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const parsed = await parseBody(CheckoutModulesUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const data: Record<string, string[]> = {};
  if (parsed.data.enabledModules) data.enabledModules = parsed.data.enabledModules;
  if (parsed.data.moduleOrder) data.moduleOrder = parsed.data.moduleOrder;

  const config = await db.checkoutConfig.upsert({
    where: { storeId: store.id },
    create: {
      storeId: store.id,
      enabledModules: data.enabledModules ?? ["customer_details", "shipping_address", "delivery_method", "payment_method", "order_summary"],
      moduleOrder: data.moduleOrder ?? ["customer_details", "shipping_address", "delivery_method", "coupon", "order_notes", "payment_method", "order_summary"],
    },
    update: data,
  });

  return ok(config);
});
