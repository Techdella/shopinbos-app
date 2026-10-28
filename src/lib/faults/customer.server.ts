import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { customerSideFailure, isShippedLate, returnProblem, returnedEvent, type FaultOutcome } from "@shared/fault-matrix";
import { applyFault, faultCasesFor, loadFaultFacts } from "./resolve.server";

// The customer's side of who pays when things go wrong: a supplier out of stock after payment, a parcel past its
// ship-by date (the customer may cancel it for a full refund from the order page), a delivery that came back, and
// what the order page shows (late parts, outcomes, returns). Each outcome is applied once (src/lib/faults/resolve.server.ts).

type Result = { ok: true; outcome: FaultOutcome | null; message: string } | { ok: false; error: string };

const PAID_ORDER = ["paid", "processing", "packed", "shipped", "delivered"];

/** The order was paid (for pay on delivery: the delivery fee upfront at least), so something can go back. */
async function orderWasPaid(retailOrderId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: retailOrderId }, select: { status: true, paystackStatus: true, paymentMethod: true, depositPaidAt: true } });
  if (!order) return false;
  return PAID_ORDER.includes(order.status) || order.paystackStatus === "success" || Boolean(order.depositPaidAt);
}

/** A part whose supplier is out (rejected or cancelled): its delivery job stops if nobody picked it up. */
async function stopPartDelivery(retailOrderId: string, supplierId: string) {
  const jobs = await db.deliveryBooking.findMany({ where: { orderId: retailOrderId, shipmentKey: `supplier:${supplierId}`, status: { in: ["pending", "confirmed"] }, pickedUpAt: null }, select: { id: true } });
  const { cancelUnassignedDeliveryJob } = await import("@/lib/logistics/booking.server");
  for (const job of jobs) await cancelUnassignedDeliveryJob(job.id).catch(() => false);
}

/** Every part of the order is gone (suppliers out, nothing of the seller's own): the order is cancelled. */
async function cancelOrderIfNothingLeft(retailOrderId: string) {
  const facts = await loadFaultFacts(retailOrderId);
  if (!facts) return;
  const live = facts.supplierOrders.some((row) => !["rejected", "cancelled", "expired"].includes(row.status));
  if (live || facts.faultOrder.parts.some((part) => part.key === "own")) return;
  const order = await db.retailOrder.findUnique({ where: { id: retailOrderId } });
  const store = order ? await db.store.findUnique({ where: { id: order.storeId }, select: { id: true, name: true } }) : null;
  if (!order || !store || ["cancelled", "refunded", "delivered", "shipped"].includes(order.status)) return;
  const { updateOrderStatus } = await import("@/lib/orders/update-status");
  await updateOrderStatus(store, order, { status: "cancelled", notes: order.notes ?? undefined }).catch(() => null);
}

/** Row 1, out of stock after payment: the supplier said no to a paid order. Applied once. Never throws. */
export async function onSupplierRejected(supplierOrderId: string) {
  try {
    const row = await db.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { id: true, supplierId: true, retailOrderId: true, status: true, replacesId: true, idempotencyKey: true } });
    // A replacement (a switch after expiry, or a fault's replacement) isn't a new part: the seller decides those.
    if (!row || row.status !== "rejected" || row.replacesId) return null;
    if (!(await orderWasPaid(row.retailOrderId))) return null;
    await stopPartDelivery(row.retailOrderId, row.supplierId);
    const applied = await applyFault({ key: `oos:${row.id}`, source: "out_of_stock", retailOrderId: row.retailOrderId, event: "out_of_stock", partKeys: [`supplier:${row.supplierId}`] });
    await cancelOrderIfNothingLeft(row.retailOrderId);
    return applied.ok ? applied.outcome : null;
  } catch (error) {
    console.error(`[faults] out of stock ${supplierOrderId}`, error);
    return null;
  }
}

/** The parts of an order past their ship-by date and not sent: the customer may cancel each for a full refund. */
export async function latePartsFor(retailOrderId: string, now = new Date()) {
  const rows = await db.supplierOrder.findMany({ where: { retailOrderId, status: { in: ["pending", "accepted"] }, shippedAt: null, shipBy: { not: null } }, select: { id: true, status: true, shipBy: true, shippedAt: true, lateAt: true, items: true } });
  return rows
    .filter((row) => row.lateAt || isShippedLate(row, now))
    .map((row) => ({
      id: row.id,
      shipBy: row.shipBy!.toISOString(),
      items: (Array.isArray(row.items) ? row.items : []).map((item) => {
        const line = item as { name?: unknown; quantity?: unknown };
        return `${Math.max(1, Number(line.quantity) || 1)} × ${typeof line.name === "string" ? line.name : "Item"}`;
      }),
    }));
}

/**
 * Row 2, the supplier shipped late: the customer cancels a late part from their order page (the link is the order's
 * private id, like the page itself). Full refund of that part, the supplier's strike was given when it went late,
 * the seller loses the margin on it. Safe to press twice.
 */
export async function cancelLatePart(storeId: string, retailOrderId: string, supplierOrderId: string): Promise<Result> {
  const order = await db.retailOrder.findFirst({ where: { id: retailOrderId, storeId }, select: { id: true, orderNumber: true, store: { select: { userId: true } } } });
  if (!order) return { ok: false, error: "We couldn't find this order." };
  const late = (await latePartsFor(order.id)).find((part) => part.id === supplierOrderId);
  const row = await db.supplierOrder.findFirst({ where: { id: supplierOrderId, retailOrderId: order.id }, select: { id: true, supplierId: true, status: true, cancelledByCustomerAt: true, supplier: { select: { userId: true } } } });
  if (!row) return { ok: false, error: "We couldn't find that part of your order." };
  if (row.cancelledByCustomerAt) {
    const done = await applyFault({ key: `late:${row.id}`, source: "late_cancel", retailOrderId: order.id, event: "shipped_late", partKeys: [`supplier:${row.supplierId}`] });
    return { ok: true, outcome: done.ok ? done.outcome : null, message: "Already cancelled. Your refund is on its way." };
  }
  if (!late) return { ok: false, error: "This part isn't late, or it's already on its way, so it can't be cancelled here. Contact the shop." };
  const moved = await db.supplierOrder.updateMany({ where: { id: row.id, status: { in: ["pending", "accepted"] }, shippedAt: null }, data: { status: "cancelled", cancelledByCustomerAt: new Date(), rejectReason: "Cancelled by the customer: not sent by the ship-by date." } });
  if (moved.count !== 1) return { ok: false, error: "It has just been sent, so it can't be cancelled now. Refresh to see where it is." };
  await stopPartDelivery(order.id, row.supplierId);
  const applied = await applyFault({ key: `late:${row.id}`, source: "late_cancel", retailOrderId: order.id, event: "shipped_late", partKeys: [`supplier:${row.supplierId}`] });
  await createNotification({ userId: row.supplier.userId, type: "dropshipping", priority: "warning", title: `Order ${order.orderNumber} was cancelled: not sent in time`, description: "The customer cancelled it after the ship-by date. Don't send it. Your pay for it goes back to the shop from your next payments.", link: `/supplier/orders/${row.id}`, event: "supplier_order.cancelled", dedupeKey: `late-cancel:${row.id}` }).catch(() => null);
  await cancelOrderIfNothingLeft(order.id);
  if (!applied.ok) return { ok: false, error: applied.error };
  return { ok: true, outcome: applied.outcome, message: applied.outcome.lines.customer };
}

/**
 * Rows 5 and 7: a delivery came back (returned). A customer who couldn't be reached (or refused) gets the goods back
 * less the trip; pay on delivery that wasn't paid at the door loses only the fee paid upfront. Only for reasons on the
 * customer's side; anything else waits for the team. Applied once per job. Never throws.
 */
export async function onDeliveryReturned(bookingId: string) {
  try {
    const job = await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { id: true, orderId: true, shipmentKey: true, failedReason: true, tripKind: true } });
    if (!job?.orderId || job.tripKind || !customerSideFailure(job.failedReason)) return null;
    const facts = await loadFaultFacts(job.orderId);
    if (!facts) return null;
    const event = returnedEvent({ paymentMethod: facts.order.paymentMethod, goodsPaid: facts.faultOrder.goodsPaid });
    const partKeys = job.shipmentKey && facts.faultOrder.parts.some((part) => part.key === job.shipmentKey) ? [job.shipmentKey] : undefined;
    const applied = await applyFault({ key: `${event === "pod_refused" ? "pod" : "failed"}:${job.id}`, source: event === "pod_refused" ? "pod_refused" : "failed_delivery", retailOrderId: job.orderId, event, partKeys });
    return applied.ok ? applied.outcome : null;
  } catch (error) {
    console.error(`[faults] returned delivery ${bookingId}`, error);
    return null;
  }
}

/** What the customer's order page shows: late parts to cancel, outcomes so far, returns and what can be reported. */
export async function customerFaultView(order: { id: string; storeId: string; status: string; deliveredAt: Date | null }) {
  const [late, cases, store, request] = await Promise.all([
    latePartsFor(order.id),
    faultCasesFor(order.id),
    db.store.findUnique({ where: { id: order.storeId }, select: { returnsAllowed: true, returnWindowDays: true, returnShippingPayer: true } }),
    db.returnRequest.findFirst({ where: { retailOrderId: order.id, status: { notIn: ["cancelled"] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, reason: true, refundKobo: true, declineReason: true, createdAt: true } }),
  ]);
  const settings = store ?? { returnsAllowed: false, returnWindowDays: 7, returnShippingPayer: "customer" };
  return {
    late,
    outcomes: cases.map((row) => ({ id: row.id, label: row.label, line: row.lines?.customer ?? null, createdAt: row.createdAt })),
    returns: {
      allowed: settings.returnsAllowed,
      windowDays: settings.returnWindowDays,
      payer: (settings.returnShippingPayer === "seller" ? "seller" : "customer") as "seller" | "customer",
      problem: request ? null : returnProblem(settings, order),
      request: request ? { id: request.id, status: request.status, reason: request.reason, refundKobo: request.refundKobo, declineReason: request.declineReason, createdAt: request.createdAt.toISOString() } : null,
    },
  };
}

export type CustomerFaultView = Awaited<ReturnType<typeof customerFaultView>>;
