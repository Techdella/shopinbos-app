import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { SubscriberUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const subscriber = await db.subscriber.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!subscriber) return apiError("NOT_FOUND", "Subscriber not found", 404);

  return ok(subscriber);
});

export const PATCH = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const existing = await db.subscriber.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Subscriber not found", 404);

  const parsed = await parseBody(SubscriberUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const updated = await db.subscriber.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return ok(updated);
});

export const DELETE = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const existing = await db.subscriber.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Subscriber not found", 404);

  await db.subscriber.update({
    where: { id: params.id },
    data: { status: "unsubscribed", unsubscribedAt: new Date() },
  });

  return noContent();
});
