import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { CheckoutConfigCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

const DEFAULTS = {
  layout: "multi_step" as const,
  enabledModules: ["customer_details", "shipping_address", "delivery_method", "payment_method", "order_summary"],
  moduleOrder: ["customer_details", "shipping_address", "delivery_method", "coupon", "order_notes", "payment_method", "order_summary"],
  requirePhone: false,
  enableNotes: true,
  enableGiftNote: false,
  enableCoupon: true,
  enableUpsells: false,
  enableTrustBadges: true,
  upsellProducts: [],
};

export const GET = withSeller(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const config = await db.checkoutConfig.findUnique({ where: { storeId: store.id } });
  if (!config) {
    return ok({ ...DEFAULTS, storeId: store.id });
  }

  return ok(config);
});

export const PUT = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = CheckoutConfigCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const config = await db.checkoutConfig.upsert({
    where: { storeId: store.id },
    create: { ...parsed.data, storeId: store.id },
    update: { ...parsed.data },
  });

  return ok(config, 201);
});
