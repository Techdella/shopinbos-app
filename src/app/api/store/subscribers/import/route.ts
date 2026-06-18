import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { SubscriberBulkImportSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const parsed = await parseBody(SubscriberBulkImportSchema, req);
  if ("error" in parsed) return parsed.error;

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const results = { created: 0, errors: 0 };

  for (const item of parsed.data.subscribers) {
    try {
      await db.subscriber.upsert({
        where: { storeId_email: { storeId: store.id, email: item.email } },
        create: {
          storeId: store.id,
          ...item,
        },
        update: item,
      });
      results.created++;
    } catch {
      results.errors++;
    }
  }

  return ok(results);
});
