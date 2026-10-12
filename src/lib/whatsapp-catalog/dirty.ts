import "server-only";

import { db } from "@/lib/db/client";

/**
 * A product changed: flag the store's WhatsApp catalog for the next incremental sync (the cron, or the next visit
 * to the WhatsApp catalog page). One quick database update; never calls Meta and never throws, so product saves
 * don't wait on WhatsApp or fail because of it. Stores without a synced catalog are untouched.
 */
export async function markCatalogDirty(storeId: string | null | undefined): Promise<void> {
  if (!storeId) return;
  await db.whatsAppCatalog
    .updateMany({ where: { storeId, catalogId: { not: null } }, data: { dirty: true, dirtyAt: new Date() } })
    .catch(() => null);
}
