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
  /** Set when Paystack split the payment to the businesses' own banks (src/lib/wallet). */
  paymentSplit?: unknown;
}

/**
 * How this payment goes back: through Paystack when Shopinbos took it by card (it has a Paystack reference), else
 * by hand (a bank transfer, cash or POS the seller collected, or any other gateway).
 */
export function refundRoute(order: RefundableOrder): "paystack" | "manual" {
  // A split payment was settled to the seller's (and suppliers') own banks, not Shopinbos's: Shopinbos has nothing
  // to send back, so the seller refunds the buyer.
  if (order.paymentSplit) return "manual";
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

/**
 * A refund decided by "who pays when things go wrong" (shared/fault-matrix.ts): part of a transaction, once per case
 * (the case key is the merchant note). A refund gives money back; it is never a purchase.
 */
export function faultRefundBody(input: { transaction: string; caseKey: string; amountKobo: number; orderNumber: string }) {
  return {
    transaction: input.transaction,
    amount: Math.max(0, Math.round(input.amountKobo)),
    merchant_note: `fault-refund:${input.caseKey}`,
    customer_note: `Refund for order ${input.orderNumber}.`.slice(0, 200),
  };
}

/**
 * How a fault refund goes back: a card payment not split at checkout goes back through Paystack in full; a split one
 * is sent by the seller (their bank has the money), except Shopinbos's own take, which Shopinbos refunds itself
 * through Paystack (it's in Shopinbos's balance); anything paid outside Paystack is sent back by the seller.
 */
export function faultRefundPlan(order: RefundableOrder, refundKobo: number, fromShopinbosKobo: number): { paystackKobo: number; sellerKobo: number } {
  const total = Math.max(0, Math.round(refundKobo));
  const route = refundRoute(order);
  const card = (!order.paymentMethod || order.paymentMethod === "paystack" || order.paymentMethod === "pay_on_delivery") && Boolean(order.paystackRef);
  if (route === "paystack") return { paystackKobo: total, sellerKobo: 0 };
  const own = card && order.paymentSplit ? Math.min(total, Math.max(0, Math.round(fromShopinbosKobo))) : 0;
  return { paystackKobo: own, sellerKobo: total - own };
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
