import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { AbandonedCartConfigCreateSchema, AbandonedCartConfigUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

const DEFAULT_ABANDONED_CART_CONFIG = {
  enabled: true,
  firstReminderAfter: 60,
  secondReminderAfter: 1440,
  thirdReminderAfter: 4320,
  discountPercent: 0,
  sendEmail: true,
  emailTemplateId: null,
};

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const config = await db.abandonedCartConfig.findUnique({
    where: { storeId: store.id },
  });

  return ok(config ?? { storeId: store.id, ...DEFAULT_ABANDONED_CART_CONFIG });
});

export const PUT = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(AbandonedCartConfigUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const config = await db.abandonedCartConfig.upsert({
    where: { storeId: store.id },
    create: {
      storeId: store.id,
      ...DEFAULT_ABANDONED_CART_CONFIG,
      ...parsed.data,
    } as any,
    update: parsed.data,
  });

  return ok(config);
});
