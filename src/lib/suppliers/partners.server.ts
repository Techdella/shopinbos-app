import "server-only";
import { db } from "@/lib/db/client";

// The delivery partners a supplier works with: their active connections in the logistics marketplace
// (DeliveryConnection, "My delivery partners"; the plan limit is checked in src/lib/delivery-market/manage.server.ts
// connectPartner). Pickups for their orders go to these after the shop's own choice
// (src/lib/supplier-orders/pickup.server.ts).

/** Connected partner ids, oldest connection first. Empty when none. */
export async function supplierPartnerIds(supplierUserId: string): Promise<string[]> {
  const rows = await db.deliveryConnection
    .findMany({ where: { ownerUserId: supplierUserId, ownerRole: "supplier", status: "active" }, orderBy: { createdAt: "asc" }, select: { logisticsPartnerId: true } })
    .catch(() => []);
  return rows.map((row) => row.logisticsPartnerId);
}
