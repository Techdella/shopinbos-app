import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { customerSideFailure, isShippedLate, returnProblem, returnedEvent, type FaultOutcome } from "@shared/fault-matrix";
import { applyFault, decideFaultCase, faultCasesFor, loadFaultFacts } from "./resolve.server";

// The customer's side of who pays when things go wrong: a supplier out of stock after payment, a parcel past its
// ship-by date (the customer can ask the shop to cancel it), a delivery that came back, and what the order page shows
// (late parts, outcomes, returns). The shop is the seller's business (like Shopify): everything here only suggests an
// outcome from the matrix, and the seller accepts it or handles it themselves (sellerDecidesFault). Once each.

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

/** Row 1, out of stock after payment: the supplier said no to a paid order. Suggested to the seller, once. Never throws. */
export async function onSupplierRejected(supplierOrderId: string) {
  try {
    const row = await db.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { id: true, supplierId: true, retailOrderId: true, status: true, replacesId: true, idempotencyKey: true } });
    // A replacement (a switch after expiry, or a fault's replacement) isn't a new part: the seller decides those.
    if (!row || row.status !== "rejected" || row.replacesId) return null;
    if (!(await orderWasPaid(row.retailOrderId))) return null;
    await stopPartDelivery(row.retailOrderId, row.supplierId);
    const applied = await applyFault({ key: `oos:${row.id}`, source: "out_of_stock", retailOrderId: row.retailOrderId, event: "out_of_stock", partKeys: [`supplier:${row.supplierId}`], propose: true });
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
 * Row 2, the supplier shipped late: the customer asks the shop to cancel a late part from their order page (the link is
 * the order's private id, like the page itself). Nothing is cancelled yet: the seller sees what it would mean (a full
 * refund of that part, the supplier's pay back to the shop) and accepts it or sorts it out with their customer.
 */
export async function cancelLatePart(storeId: string, retailOrderId: string, supplierOrderId: string): Promise<Result> {
  const order = await db.retailOrder.findFirst({ where: { id: retailOrderId, storeId }, select: { id: true, orderNumber: true, store: { select: { userId: true } } } });
  if (!order) return { ok: false, error: "We couldn't find this order." };
  const row = await db.supplierOrder.findFirst({ where: { id: supplierOrderId, retailOrderId: order.id }, select: { id: true, supplierId: true } });
  if (!row) return { ok: false, error: "We couldn't find that part of your order." };
  const asked = await db.faultCase.findUnique({ where: { key: `late:${row.id}` }, select: { status: true } });
  if (asked) return { ok: true, outcome: null, message: asked.status === "applied" ? "Cancelled. The store is sending your refund." : asked.status === "declined" ? "The store will be in touch about this." : "You've asked the store. They'll let you know." };
  const late = (await latePartsFor(order.id)).find((part) => part.id === supplierOrderId);
  if (!late) return { ok: false, error: "This part isn't late, or it's already on its way, so it can't be cancelled here. Contact the shop." };
  const applied = await applyFault({ key: `late:${row.id}`, source: "late_cancel", retailOrderId: order.id, event: "shipped_late", partKeys: [`supplier:${row.supplierId}`], propose: true });
  if (!applied.ok) return { ok: false, error: applied.error };
  return { ok: true, outcome: null, message: "We've asked the store to cancel it. They'll let you know." };
}

/**
 * The seller's decision on a suggested outcome (src/lib/faults/resolve.server.ts decideFaultCase), with what each
 * kind needs: a late part the customer asked to cancel is cancelled first (if it hasn't been sent), a part out of
 * stock or cancelled leaves the order cancelled when nothing else is left, and a return is marked refunded.
 */
export async function sellerDecidesFault(sellerId: string, caseId: string, accept: boolean): Promise<Result> {
  const decided = await decideFaultCase(sellerId, caseId, accept, async (row) => {
    if (row.source !== "late_cancel") return null;
    const supplierId = row.partKeys[0]?.startsWith("supplier:") ? row.partKeys[0].slice(9) : null;
    const so = supplierId ? await db.supplierOrder.findFirst({ where: { retailOrderId: row.retailOrderId, supplierId, replacesId: null }, select: { id: true, supplier: { select: { userId: true } }, retailOrder: { select: { orderNumber: true } } } }) : null;
    if (!so || !supplierId) return "We couldn't find that part of the order.";
    const moved = await db.supplierOrder.updateMany({ where: { id: so.id, status: { in: ["pending", "accepted"] }, shippedAt: null }, data: { status: "cancelled", cancelledByCustomerAt: new Date(), rejectReason: "Cancelled by the shop at the customer's request: not sent by the ship-by date." } });
    if (moved.count !== 1) return "It has just been sent, so it can't be cancelled now.";
    await stopPartDelivery(row.retailOrderId, supplierId);
    await createNotification({ userId: so.supplier.userId, type: "dropshipping", priority: "warning", title: `Order ${so.retailOrder.orderNumber} was cancelled: not sent in time`, description: "The shop cancelled it at the customer's request after the ship-by date. Don't send it. Your pay for it goes back to the shop from your next payments.", link: `/supplier/orders/${so.id}`, event: "supplier_order.cancelled", dedupeKey: `late-cancel:${so.id}` }).catch(() => null);
    return null;
  });
  if (!decided.ok) return decided;
  const row = await db.faultCase.findUnique({ where: { id: caseId }, select: { source: true, retailOrderId: true, key: true } });
  if (accept && row) {
    if (row.source === "out_of_stock" || row.source === "late_cancel") await cancelOrderIfNothingLeft(row.retailOrderId);
    if (row.source === "return") await db.returnRequest.updateMany({ where: { id: row.key.replace(/^return:/, ""), status: "approved" }, data: { status: "refunded", receivedAt: new Date(), refundKobo: decided.outcome.refundKobo, faultCaseId: caseId } });
  }
  return { ok: true, outcome: decided.outcome, message: accept ? "Done. Everyone has been told what it means for them." : "Got it: you're handling this one yourself. Nothing was sent to anyone." };
}

/**
 * Rows 5 and 7: a delivery came back (returned). The matrix suggests: a customer who couldn't be reached (or refused)
 * gets the goods back less the trip; pay on delivery that wasn't paid at the door loses only the fee paid upfront.
 * Only for reasons on the customer's side. Suggested to the seller, once per job. Never throws.
 */
export async function onDeliveryReturned(bookingId: string) {
  try {
    const job = await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { id: true, orderId: true, shipmentKey: true, failedReason: true, tripKind: true } });
    if (!job?.orderId || job.tripKind || !customerSideFailure(job.failedReason)) return null;
    const facts = await loadFaultFacts(job.orderId);
    if (!facts) return null;
    const event = returnedEvent({ paymentMethod: facts.order.paymentMethod, goodsPaid: facts.faultOrder.goodsPaid });
    const partKeys = job.shipmentKey && facts.faultOrder.parts.some((part) => part.key === job.shipmentKey) ? [job.shipmentKey] : undefined;
    const applied = await applyFault({ key: `${event === "pod_refused" ? "pod" : "failed"}:${job.id}`, source: event === "pod_refused" ? "pod_refused" : "failed_delivery", retailOrderId: job.orderId, event, partKeys, propose: true });
    return applied.ok ? applied.outcome : null;
  } catch (error) {
    console.error(`[faults] returned delivery ${bookingId}`, error);
    return null;
  }
}

/** What the customer's order page shows: late parts to cancel, outcomes so far, returns and what can be reported. */
export async function customerFaultView(order: { id: string; storeId: string; status: string; deliveredAt: Date | null }) {
  const [lateParts, cases, store, request] = await Promise.all([
    latePartsFor(order.id),
    faultCasesFor(order.id),
    db.store.findUnique({ where: { id: order.storeId }, select: { returnsAllowed: true, returnWindowDays: true, returnShippingPayer: true } }),
    db.returnRequest.findFirst({ where: { retailOrderId: order.id, status: { notIn: ["cancelled"] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, reason: true, refundKobo: true, declineReason: true, createdAt: true } }),
  ]);
  const settings = store ?? { returnsAllowed: false, returnWindowDays: 7, returnShippingPayer: "customer" };
  // A late part the customer already asked the shop to cancel shows that, not the button again.
  const askedRows = lateParts.length ? await db.faultCase.findMany({ where: { key: { in: lateParts.map((part) => `late:${part.id}`) } }, select: { key: true, status: true } }) : [];
  const late = lateParts.map((part) => ({ ...part, asked: askedRows.find((row) => row.key === `late:${part.id}`)?.status ?? null }));
  return {
    late,
    // Only what the shop decided reaches its customer: a suggestion waiting for the seller isn't an outcome yet.
    outcomes: cases.map((row) => ({ id: row.id, label: row.label, line: row.status === "applied" ? row.lines?.customer ?? null : row.status === "declined" ? "The store will be in touch about this." : "The store is looking at this and will let you know.", createdAt: row.createdAt })),
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
