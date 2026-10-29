import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { RETURN_REASONS, cleanReturnWindow, returnProblem, type ReturnReason } from "@shared/fault-matrix";
import { applyFault, bookReturnTrip, loadFaultFacts } from "./resolve.server";

// Returns for a change of mind (the store's switch, shared/fault-matrix.ts row 6). The customer asks from the order
// page (a reason, photos); the seller approves (the supplier hears the item is coming back) and a return trip is
// booked with the same delivery partner; once it's back (the trip is delivered, or the seller says it arrived) the
// refund follows the matrix: the customer pays the trip back unless the store pays it, the supplier returns its pay
// (unpaid until it sells again) and the seller earns no margin.

type Result<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

export const RETURN_REASON_WORDS: Record<ReturnReason, string> = {
  changed_mind: "Changed my mind",
  doesnt_fit: "It doesn't fit",
  not_as_expected: "Not what I expected",
};

/** The store's returns switch, from its settings screen (web and phone). */
export async function saveReturnsSetting(userId: string, input: { returnsAllowed?: unknown; returnWindowDays?: unknown; returnShippingPayer?: unknown }): Promise<Result> {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) return { ok: false, error: "Set up your shop first." };
  const data: { returnsAllowed?: boolean; returnWindowDays?: number; returnShippingPayer?: string } = {};
  if (typeof input.returnsAllowed === "boolean") data.returnsAllowed = input.returnsAllowed;
  if (input.returnWindowDays !== undefined) data.returnWindowDays = cleanReturnWindow(input.returnWindowDays);
  if (input.returnShippingPayer !== undefined) {
    if (input.returnShippingPayer !== "customer" && input.returnShippingPayer !== "seller") return { ok: false, error: "Pick who pays the trip back." };
    data.returnShippingPayer = input.returnShippingPayer;
  }
  if (!Object.keys(data).length) return { ok: false, error: "Nothing to save." };
  await db.store.update({ where: { id: store.id }, data });
  return { ok: true };
}

/** The customer asks to return a delivered order (the order page; access is the order's private id). */
export async function requestReturn(storeId: string, retailOrderId: string, input: { reason: unknown; message?: unknown; photos?: unknown }): Promise<Result<{ id: string }>> {
  if (!(RETURN_REASONS as readonly string[]).includes(String(input.reason))) return { ok: false, error: "Pick why you're returning it." };
  const order = await db.retailOrder.findFirst({ where: { id: retailOrderId, storeId }, select: { id: true, orderNumber: true, status: true, deliveredAt: true, buyerName: true, store: { select: { userId: true, returnsAllowed: true, returnWindowDays: true, returnShippingPayer: true } } } });
  if (!order) return { ok: false, error: "We couldn't find this order." };
  const problem = returnProblem(order.store, order);
  if (problem) return { ok: false, error: problem };
  const open = await db.returnRequest.findFirst({ where: { retailOrderId: order.id, status: { notIn: ["cancelled", "declined"] } }, select: { id: true } });
  if (open) return { ok: false, error: "You've already asked to return this order. The shop will get back to you." };
  const photos = (Array.isArray(input.photos) ? input.photos : []).filter((url): url is string => typeof url === "string" && /^https:\/\/[^\s"'<>]{4,1000}$/.test(url)).slice(0, 4);
  const message = typeof input.message === "string" ? input.message.trim().slice(0, 1000) || null : null;
  const created = await db.returnRequest.create({ data: { retailOrderId: order.id, storeId, reason: String(input.reason), message, photos, returnPayer: order.store.returnShippingPayer === "seller" ? "seller" : "customer" } });
  await createNotification({ userId: order.store.userId, type: "order", priority: "warning", title: `${order.buyerName} wants to return order ${order.orderNumber}`, description: `${RETURN_REASON_WORDS[input.reason as ReturnReason]}${message ? `: "${message}"` : ""}. Approve it to book the trip back, or say why not.`, link: `/home/orders/${order.id}`, event: "order.return_requested", dedupeKey: `return:${created.id}` }).catch(() => null);
  return { ok: true, id: created.id };
}

/** The seller's open returns (and the latest closed ones) with what the refund would be, for the order screens. */
export async function returnsForOrder(storeId: string, retailOrderId: string) {
  const rows = await db.returnRequest.findMany({ where: { storeId, retailOrderId }, orderBy: { createdAt: "desc" }, take: 5 });
  return rows.map((row) => ({ id: row.id, reason: row.reason, reasonLabel: RETURN_REASON_WORDS[row.reason as ReturnReason] ?? row.reason, message: row.message, photos: row.photos, status: row.status, returnPayer: row.returnPayer, refundKobo: row.refundKobo, declineReason: row.declineReason, createdAt: row.createdAt.toISOString() }));
}

/** The seller approves (books the trip back with the same partner) or declines (with a reason the customer sees). */
export async function decideReturn(store: { id: string; userId: string }, returnId: string, approve: boolean, reason?: string | null): Promise<Result> {
  const row = await db.returnRequest.findFirst({ where: { id: returnId, storeId: store.id } });
  if (!row) return { ok: false, error: "We couldn't find this return." };
  if (row.status !== "requested") return { ok: false, error: "This return has already been answered." };
  if (!approve) {
    const why = (reason ?? "").trim().slice(0, 500);
    if (why.length < 5) return { ok: false, error: "Say why, so your customer understands." };
    await db.returnRequest.update({ where: { id: row.id }, data: { status: "declined", declineReason: why, decidedAt: new Date() } });
    return { ok: true };
  }
  const facts = await loadFaultFacts(row.retailOrderId);
  if (!facts) return { ok: false, error: "We couldn't find this order." };
  // The trip back, with the partner who delivered it, at the return fee on its rate card.
  let bookingId: string | null = null;
  for (const part of facts.faultOrder.parts) {
    if (!part.partner) continue;
    const job = facts.bookings.find((booking) => !booking.replacedById && (booking.shipmentKey === part.key || (!booking.shipmentKey && facts.faultOrder.parts.length === 1)));
    if (!job) continue;
    const trip = await bookReturnTrip(job.id, part.partner.returnFeeKobo / 100, row.returnPayer, `Customer return: order ${facts.order.orderNumber}`).catch(() => null);
    if (trip && !bookingId) bookingId = trip.id;
  }
  await db.returnRequest.update({ where: { id: row.id }, data: { status: "approved", decidedAt: new Date(), returnBookingId: bookingId } });
  // Suppliers hear their item is coming back (they're paid again when it sells).
  for (const so of facts.supplierOrders.filter((item) => !item.replacesId)) {
    await createNotification({ userId: so.supplier.userId, type: "dropshipping", priority: "info", title: `A return is coming back: order ${facts.order.orderNumber}`, description: "The customer is returning it (change of mind). Your pay for it goes back to the shop once it's back; you're paid again when it sells.", link: `/supplier/orders/${so.id}`, event: "order.return_approved", dedupeKey: `return-approved:${row.id}:${so.id}` }).catch(() => null);
  }
  return { ok: true };
}

/** The item is back (the seller says so, or the return trip was delivered): the refund follows the matrix, once. */
export async function markReturnReceived(store: { id: string } | null, returnId: string, actorUserId?: string | null): Promise<Result<{ refundKobo: number }>> {
  const row = await db.returnRequest.findFirst({ where: { id: returnId, ...(store ? { storeId: store.id } : {}) } });
  if (!row) return { ok: false, error: "We couldn't find this return." };
  if (row.status === "refunded") return { ok: true, refundKobo: row.refundKobo };
  if (row.status !== "approved") return { ok: false, error: "Approve the return first." };
  const applied = await applyFault({ key: `return:${row.id}`, source: "return", retailOrderId: row.retailOrderId, event: "changed_mind", returnPayer: row.returnPayer === "seller" ? "seller" : "customer", decidedByUserId: actorUserId ?? null });
  if (!applied.ok) return { ok: false, error: applied.error };
  await db.returnRequest.update({ where: { id: row.id }, data: { status: "refunded", receivedAt: new Date(), refundKobo: applied.outcome.refundKobo, faultCaseId: applied.caseId } });
  return { ok: true, refundKobo: applied.outcome.refundKobo };
}

/** The return trip reached the seller or supplier (src/lib/logistics/jobs.ts). Never throws. */
export async function onReturnTripDelivered(bookingId: string) {
  try {
    const row = await db.returnRequest.findFirst({ where: { returnBookingId: bookingId, status: "approved" }, select: { id: true } });
    if (row) await markReturnReceived(null, row.id);
  } catch (error) {
    console.error(`[returns] return trip ${bookingId}`, error);
  }
}
