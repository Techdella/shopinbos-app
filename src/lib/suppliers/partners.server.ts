import "server-only";
import { db } from "@/lib/db/client";
import { PLAN_NAMES, cheapestPlanWhere, planKeyFor, supplierLimits } from "@shared/plans";

// The delivery partners a supplier works with (SupplierLogisticsConnection), within their plan (Free 2, Plus 10,
// Pro unlimited). Pickups for their orders go to these first (src/lib/supplier-orders/pickup.server.ts).

export class PartnerConnectionError extends Error {}

/** Connected partner ids, the preferred one first. Empty when none (or before the table exists). */
export async function supplierPartnerIds(supplierId: string): Promise<string[]> {
  const rows = await db.supplierLogisticsConnection
    .findMany({ where: { supplierId }, orderBy: [{ preferred: "desc" }, { createdAt: "asc" }], select: { logisticsPartnerId: true } })
    .catch(() => []);
  return rows.map((row) => row.logisticsPartnerId);
}

async function limitFor(supplierUserId: string) {
  const user = await db.user.findUnique({ where: { id: supplierUserId }, select: { aiCredits: true } });
  return supplierLimits(planKeyFor("supplier", user?.aiCredits)).logisticsPartners;
}

export async function connectPartner(supplier: { id: string; userId: string }, partnerId: string) {
  const partner = await db.logisticsPartner.findFirst({ where: { id: partnerId, status: "active", verificationStatus: "verified" }, select: { id: true } });
  if (!partner) throw new PartnerConnectionError("That delivery partner isn't available.");
  const [limit, count, existing] = await Promise.all([
    limitFor(supplier.userId),
    db.supplierLogisticsConnection.count({ where: { supplierId: supplier.id } }),
    db.supplierLogisticsConnection.findUnique({ where: { supplierId_logisticsPartnerId: { supplierId: supplier.id, logisticsPartnerId: partner.id } } }),
  ]);
  if (existing) return existing;
  if (limit !== null && count >= limit) {
    const plan = cheapestPlanWhere("supplier", (key) => {
      const next = supplierLimits(key).logisticsPartners;
      return next === null || next > count;
    });
    throw new PartnerConnectionError(`Your plan includes ${limit} delivery partners.${plan ? ` Upgrade to ${PLAN_NAMES[plan]} to add more, or remove one first.` : " Remove one first."}`);
  }
  return db.supplierLogisticsConnection.create({ data: { supplierId: supplier.id, logisticsPartnerId: partner.id, preferred: count === 0 } });
}

export async function disconnectPartner(supplierId: string, partnerId: string) {
  const removed = await db.supplierLogisticsConnection.findUnique({ where: { supplierId_logisticsPartnerId: { supplierId, logisticsPartnerId: partnerId } } });
  if (!removed) return;
  await db.supplierLogisticsConnection.delete({ where: { supplierId_logisticsPartnerId: { supplierId, logisticsPartnerId: partnerId } } });
  // Keep one preferred partner while any are left.
  if (removed.preferred) {
    const next = await db.supplierLogisticsConnection.findFirst({ where: { supplierId }, orderBy: { createdAt: "asc" } });
    if (next) await db.supplierLogisticsConnection.update({ where: { supplierId_logisticsPartnerId: { supplierId, logisticsPartnerId: next.logisticsPartnerId } }, data: { preferred: true } });
  }
}

export async function preferPartner(supplierId: string, partnerId: string) {
  const exists = await db.supplierLogisticsConnection.findUnique({ where: { supplierId_logisticsPartnerId: { supplierId, logisticsPartnerId: partnerId } } });
  if (!exists) throw new PartnerConnectionError("Connect that delivery partner first.");
  await db.$transaction([
    db.supplierLogisticsConnection.updateMany({ where: { supplierId }, data: { preferred: false } }),
    db.supplierLogisticsConnection.update({ where: { supplierId_logisticsPartnerId: { supplierId, logisticsPartnerId: partnerId } }, data: { preferred: true } }),
  ]);
}
