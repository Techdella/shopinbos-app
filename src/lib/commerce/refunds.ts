// Refunding a buyer whose payment arrived after their order expired and its stock sold to someone else.
// Pure (no imports) so tests/orders-followups.test.mjs can load it directly; refunds.server.ts does the calls.
//
// Idempotent by claim: an order's refund starts only while RetailOrder.refundStatus is null, with a conditional
// update that sets it to "pending" first. A replayed webhook, the payment return page and the seller marking it
// paid can all reach the refund, and only the first one through calls Paystack.

export const REFUND_STATUSES = ["pending", "processing", "processed", "failed", "manual"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export interface RefundableOrder {
  id: string;
  paymentMethod: string | null;
  paystackRef: string | null;
  paystackStatus?: string | null;
  refundStatus?: string | null;
}

/**
 * How this payment goes back: through Paystack when Shopinbos took it by card (it has a Paystack reference), else
 * by hand (a bank transfer, cash or POS the seller collected, or any other gateway).
 */
export function refundRoute(order: RefundableOrder): "paystack" | "manual" {
  const card = !order.paymentMethod || order.paymentMethod === "paystack";
  return card && Boolean(order.paystackRef) ? "paystack" : "manual";
}

/** A refund for this order can be started: nobody has claimed it yet. */
export function canStartRefund(order: Pick<RefundableOrder, "refundStatus">) {
  return !order.refundStatus;
}

/** The one key a refund for this payment is known by (logged, and sent to Paystack as the merchant note). */
export function refundIdempotencyKey(orderId: string, transaction: string) {
  return `late-payment-refund:${orderId}:${transaction}`;
}

/** The body for POST /refund: the whole transaction (Paystack refunds the full amount when none is given). */
export function paystackRefundBody(order: Pick<RefundableOrder, "id" | "paystackRef">, orderNumber: string) {
  const transaction = order.paystackRef ?? order.id;
  return {
    transaction,
    merchant_note: refundIdempotencyKey(order.id, transaction),
    customer_note: `Refund for order ${orderNumber}: it expired before your payment arrived and the items sold out.`.slice(0, 200),
  };
}

/** Paystack's reply to POST /refund, as what we save. A transaction already refunded counts as done, not failed. */
export function readPaystackRefund(httpOk: boolean, json: unknown): { ok: true; id: string | null; status: RefundStatus } | { ok: false; message: string } {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  const message = typeof body.message === "string" ? body.message : "Paystack did not accept the refund.";
  if (!httpOk || body.status !== true) {
    if (/fully reversed|already been refunded|fully refunded/i.test(message)) return { ok: true, id: null, status: "processed" };
    return { ok: false, message: message.slice(0, 300) };
  }
  const id = data.id === undefined || data.id === null ? null : String(data.id);
  return { ok: true, id, status: refundStatusFromPaystack(data.status) };
}

/** Paystack refund statuses (pending, processing, processed, failed, needs-attention) as ours. */
export function refundStatusFromPaystack(status: unknown): RefundStatus {
  if (status === "processed") return "processed";
  if (status === "failed" || status === "needs-attention") return "failed";
  return "processing";
}

/** refund.processed / refund.failed / refund.pending webhook events, as ours (null for other events). */
export function refundStatusFromEvent(event: string): RefundStatus | null {
  if (event === "refund.processed") return "processed";
  if (event === "refund.failed") return "failed";
  if (event === "refund.pending" || event === "refund.processing") return "processing";
  return null;
}

/** A refund we started is still open: a later webhook may move it. Processed and manual ones are final. */
export function refundStillOpen(status: string | null | undefined) {
  return status === "pending" || status === "processing";
}
