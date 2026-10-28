import "server-only";
import { db } from "@/lib/db/client";
import { orderEarnings, type OrderEarnings } from "@shared/seller-payments";
import { partyNets, type FaultOutcome } from "@shared/fault-matrix";
import { readSplitPlan } from "@/lib/wallet/rules";
import { faultCasesFor } from "./resolve.server";
import { returnsForOrder } from "./returns.server";

// The seller's side of one order (web /home/orders/[id] and the phone's order screen): what they earn on it (C10:
// from the split, after any problem on it), what went wrong and what it meant for them, and the customer's return.

export interface SellerOrderMoney {
  earnings: OrderEarnings;
  problems: Array<{ id: string; label: string; line: string | null; refund: string | null; createdAt: string }>;
  returns: Awaited<ReturnType<typeof returnsForOrder>>;
}

export async function sellerOrderMoney(order: { id: string; storeId: string; total: number; paymentSplit: unknown; balanceSplit?: unknown; balancePaidAt?: Date | null }): Promise<SellerOrderMoney> {
  const [cases, returns, supplierOrders, bookings] = await Promise.all([
    faultCasesFor(order.id),
    returnsForOrder(order.storeId, order.id),
    db.supplierOrder.findMany({ where: { retailOrderId: order.id, status: { notIn: ["rejected", "cancelled", "expired"] }, replacesId: null }, select: { costTotal: true } }),
    db.deliveryBooking.findMany({ where: { orderId: order.id, tripKind: null, status: { notIn: ["cancelled", "declined"] }, replacedById: null }, select: { deliveryFee: true } }),
  ]);
  const rows = await db.faultCase.findMany({ where: { retailOrderId: order.id }, select: { outcome: true } });
  const faultsKobo = rows.reduce((sum, row) => sum + (partyNets(row.outcome as unknown as FaultOutcome).seller ?? 0), 0);
  const earnings = orderEarnings({
    totalKobo: Math.round(Number(order.total) * 100),
    plans: [readSplitPlan(order.paymentSplit), order.balancePaidAt ? readSplitPlan(order.balanceSplit) : null],
    supplierCostKobo: Math.round(supplierOrders.reduce((sum, row) => sum + row.costTotal, 0) * 100),
    partnerFeesKobo: Math.round(bookings.reduce((sum, row) => sum + row.deliveryFee, 0) * 100),
    faultsKobo,
  });
  return {
    earnings,
    problems: cases.map((row) => ({ id: row.id, label: row.label, line: row.lines?.seller ?? null, refund: row.refundWords, createdAt: row.createdAt })),
    returns,
  };
}
