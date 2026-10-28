import "server-only";

import { db } from "@/lib/db/client";
import {
  PREORDER_LOCKED_MESSAGE,
  openOrderProblem,
  supplierLevel,
  supplierLevelGoals,
  supplierPerks,
  type SupplierLevel,
  type SupplierRecord,
} from "@shared/dropship-rules";

// Supplier track-record levels, server side (the rules are shared/dropship-rules.ts): New → Trusted → Established.
// Pre-orders mean shops pay before the goods exist, so only Established suppliers can switch them on. Levels go up
// (and down) by themselves: refreshSupplierLevel is called when an order is delivered or reviewed, before the
// supplier turns pre-orders on, and when they open their level screen.

const OPEN_DROPSHIP = ["pending", "accepted"];
const OPEN_WHOLESALE = ["pending", "confirmed", "processing"] as const;

export async function supplierLevelRecord(supplierId: string, now = new Date()): Promise<SupplierRecord | null> {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { verificationStatus: true, rating: true, ratingCount: true, missedOrders: true, missedReadyDates: true, pickupLat: true, createdAt: true },
  });
  if (!supplier) return null;
  const [dropshipDelivered, wholesaleDelivered, dropshipRejected, wholesaleRejected, reviews] = await Promise.all([
    db.supplierOrder.count({ where: { supplierId, status: "delivered" } }),
    db.wholesaleOrder.count({ where: { supplierId, status: "delivered" } }),
    db.supplierOrder.count({ where: { supplierId, status: "rejected" } }),
    db.wholesaleOrder.count({ where: { supplierId, status: "cancelled", rejectReason: { not: null } } }),
    db.supplierReview.count({ where: { supplierId, targetRole: "supplier", status: "active" } }),
  ]);
  return {
    verified: supplier.verificationStatus === "verified",
    delivered: dropshipDelivered + wholesaleDelivered,
    reviews,
    rating: supplier.ratingCount > 0 ? supplier.rating : 0,
    disputes: supplier.missedOrders + dropshipRejected + wholesaleRejected,
    addressVerified: supplier.pickupLat !== null,
    createdAt: supplier.createdAt,
    missedReadyDates: supplier.missedReadyDates,
    now,
  };
}

export async function refreshSupplierLevel(supplierId: string): Promise<SupplierLevel | null> {
  const record = await supplierLevelRecord(supplierId);
  if (!record) return null;
  const level = supplierLevel(record);
  await db.supplier.update({ where: { id: supplierId }, data: { level, levelCheckedAt: new Date() } });
  return level;
}

/** The "Your level" screen and the locked pre-order card: where they are, the goals left, and what each level unlocks. */
export async function supplierLevelView(supplierId: string) {
  const record = await supplierLevelRecord(supplierId);
  if (!record) return null;
  const { level, next, goals } = supplierLevelGoals(record);
  await db.supplier.update({ where: { id: supplierId }, data: { level, levelCheckedAt: new Date() } });
  return { level, next, goals, perks: supplierPerks(level), nextPerks: next ? supplierPerks(next) : null, lockedMessage: PREORDER_LOCKED_MESSAGE };
}

/** Why this supplier can't switch pre-orders on, or null. Refreshes the level first. */
export async function preorderLevelProblem(supplierId: string): Promise<string | null> {
  const level = await refreshSupplierLevel(supplierId);
  return supplierPerks(level).preorders ? null : PREORDER_LOCKED_MESSAGE;
}

/** Why this supplier can't take another order now (New suppliers: 20 open orders at once), or null. */
export async function supplierOpenOrderProblem(supplierId: string): Promise<string | null> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { level: true } });
  if (supplierPerks(supplier?.level).openOrderLimit === null) return null;
  const [dropship, wholesale] = await Promise.all([
    db.supplierOrder.count({ where: { supplierId, status: { in: OPEN_DROPSHIP } } }),
    db.wholesaleOrder.count({ where: { supplierId, status: { in: [...OPEN_WHOLESALE] } } }),
  ]);
  return openOrderProblem(supplier?.level, dropship + wholesale);
}
