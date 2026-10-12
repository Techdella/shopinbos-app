import "server-only";
import { db } from "@/lib/db/client";
import { DROPSHIP_TO_SHIP, SUPPLIER_EARNED_STATUSES, WHOLESALE_TO_SHIP } from "./pure";

// What a supplier has to ship and has earned, across wholesale orders (WholesaleOrder.totalPrice) and dropship
// orders (SupplierOrder.costTotal). Earned = shipped or delivered; paid = the supplier confirmed the money arrived
// (paidOutAt); owed = earned but not paid. Shared by /supplier/dashboard, /supplier/payouts and the mobile overview.

const EARNED = [...SUPPLIER_EARNED_STATUSES];

export interface SupplierEarnings {
  earned: number;
  paid: number;
  owed: number;
  earnedCount: number;
  paidCount: number;
  owedCount: number;
  wholesale: { earned: number; paid: number };
  dropship: { earned: number; paid: number };
}

const round = (value: number) => Math.round(value * 100) / 100;

export async function supplierEarnings(supplierId: string, options: { since?: Date } = {}): Promise<SupplierEarnings> {
  const since = options.since ? { createdAt: { gte: options.since } } : {};
  const wholesaleWhere = { supplierId, status: { in: EARNED }, ...since };
  const dropshipWhere = { supplierId, status: { in: EARNED }, ...since };
  const [wEarned, wPaid, dEarned, dPaid] = await Promise.all([
    db.wholesaleOrder.aggregate({ where: wholesaleWhere, _sum: { totalPrice: true }, _count: { _all: true } }),
    db.wholesaleOrder.aggregate({ where: { ...wholesaleWhere, paidOutAt: { not: null } }, _sum: { totalPrice: true }, _count: { _all: true } }),
    db.supplierOrder.aggregate({ where: dropshipWhere, _sum: { costTotal: true }, _count: { _all: true } }),
    db.supplierOrder.aggregate({ where: { ...dropshipWhere, paidOutAt: { not: null } }, _sum: { costTotal: true }, _count: { _all: true } }),
  ]);
  const wholesale = { earned: wEarned._sum.totalPrice ?? 0, paid: wPaid._sum.totalPrice ?? 0 };
  const dropship = { earned: dEarned._sum.costTotal ?? 0, paid: dPaid._sum.costTotal ?? 0 };
  const earned = round(wholesale.earned + dropship.earned);
  const paid = round(wholesale.paid + dropship.paid);
  const earnedCount = wEarned._count._all + dEarned._count._all;
  const paidCount = wPaid._count._all + dPaid._count._all;
  return { earned, paid, owed: round(earned - paid), earnedCount, paidCount, owedCount: earnedCount - paidCount, wholesale, dropship };
}

/** Orders waiting for the supplier to send them: wholesale pending/confirmed/processing, dropship pending/accepted. */
export async function supplierOrdersToShip(supplierId: string) {
  const [wholesale, dropship] = await Promise.all([
    db.wholesaleOrder.count({ where: { supplierId, status: { in: [...WHOLESALE_TO_SHIP] } } }),
    db.supplierOrder.count({ where: { supplierId, status: { in: [...DROPSHIP_TO_SHIP] } } }),
  ]);
  return { wholesale, dropship, total: wholesale + dropship };
}

/** The supplier confirms they were paid for a shipped or delivered order (or takes that back). Scoped to them. */
export async function setSupplierPayout(input: { supplierId: string; kind: "wholesale" | "dropship"; orderId: string; paid: boolean }) {
  const where = { id: input.orderId, supplierId: input.supplierId, status: { in: EARNED } };
  const data = { paidOutAt: input.paid ? new Date() : null };
  const moved = input.kind === "wholesale"
    ? await db.wholesaleOrder.updateMany({ where: { ...where, paidOutAt: input.paid ? null : { not: null } }, data })
    : await db.supplierOrder.updateMany({ where: { ...where, paidOutAt: input.paid ? null : { not: null } }, data });
  return moved.count === 1;
}
