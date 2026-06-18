import { z } from "zod";
import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import type { AuthUser } from "@/lib/auth/types";

const BulkActionSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["unsubscribe"]),
});

const BulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const PATCH = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(BulkActionSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  await db.subscriber.updateMany({
    where: { id: { in: parsed.data.ids }, storeId: store.id },
    data: { status: "unsubscribed", unsubscribedAt: new Date() },
  });
  return ok({ updated: parsed.data.ids.length });
});

export const DELETE = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(BulkDeleteSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  await db.subscriber.deleteMany({
    where: { id: { in: parsed.data.ids }, storeId: store.id },
  });

  return ok({ deleted: parsed.data.ids.length });
});
