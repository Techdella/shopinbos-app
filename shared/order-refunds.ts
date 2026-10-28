// Who pays when things go wrong (the owner's table, first batch: the supplier rows). Shopinbos never holds money: every
// payment settles straight to each business's own bank (src/lib/wallet), so a customer's refund comes from the seller
// they bought from, and whoever caused it pays the seller back from their next sales (BusinessDebt, src/lib/money-owed).
//
//   Out of stock after payment   customer: full refund       supplier: owes the seller back (notsent debt), a strike
//                                                            seller: no margin
//   Supplier ships late          customer: may cancel for a  supplier: a strike for each late order; at 3 in 90 days
//   (past its handling time)     full refund                 the team reviews their tier
//   Wrong or damaged item        customer: full refund       supplier: owes the seller what it was paid plus its
//   (the packing photo shows it)                             delivery fee (a claim they can accept or dispute)
//   Damaged in transit           customer: full refund       partner: owes the goods (a claim on the booking)
//
// The refund itself, without holding money: the customer gives a bank account on their order page (checked with the
// bank, so the name shows), the seller sends the amount from their own bank and taps "Refund sent", and the customer
// confirms it arrived or says it didn't (the team then steps in). Pure, unit-tested in tests/order-refunds.test.mjs.

export const REFUND_STATUSES = ["awaiting_account", "to_send", "sent", "confirmed", "disputed", "cancelled"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_REASONS = ["out_of_stock", "supplier_late", "wrong_item", "damaged", "damaged_in_transit", "cancelled", "late_payment", "other"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export type RefundFault = "seller" | "supplier" | "partner" | "none";

/** What the customer is told the refund is for. */
export const REFUND_REASON_TEXT: Record<RefundReason, string> = {
  out_of_stock: "Part of your order was out of stock",
  supplier_late: "Your order was late and you cancelled it",
  wrong_item: "You were sent the wrong item",
  damaged: "Your item arrived damaged",
  damaged_in_transit: "Your item was damaged on the way",
  cancelled: "Your order was cancelled",
  late_payment: "Your payment arrived after the order closed",
  other: "Your order",
};

/** Days before the seller is reminded to send a refund the customer gave their account for. */
export const REFUND_SEND_DAYS = 2;
/** Days after "Refund sent" before it counts as received when the customer says nothing. */
export const REFUND_CONFIRM_DAYS = 7;
/** Late handling strikes within STRIKE_WINDOW_DAYS that send a supplier's tier to the team for review. */
export const LATE_STRIKES_FOR_REVIEW = 3;
export const STRIKE_WINDOW_DAYS = 90;

/** What can happen next, and who does it. */
export function refundNext(status: string): { who: "customer" | "seller" | "team" | null; action: string | null } {
  switch (status) {
    case "awaiting_account":
      return { who: "customer", action: "Add the bank account for your refund" };
    case "to_send":
      return { who: "seller", action: "Send the refund and tap Refund sent" };
    case "sent":
      return { who: "customer", action: "Say whether the money arrived" };
    case "disputed":
      return { who: "team", action: "Shopinbos checks with the seller" };
    default:
      return { who: null, action: null };
  }
}

/** Open: someone still has something to do. */
export const refundOpen = (status: string) => status === "awaiting_account" || status === "to_send" || status === "sent" || status === "disputed";

/** A Nigerian bank account number: 10 digits (NUBAN). */
export function cleanAccountNumber(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

/** "•••• 1234": an account number as the customer sees it back. The seller sees it whole (they send the money). */
export const maskAccount = (number: string | null | undefined) => (number ? `•••• ${number.slice(-4)}` : "");

/**
 * The supplier's ship-by deadline: accepted plus the longest handling time of its products (1 to 3 days), at the end of
 * that day in Lagos (UTC+1). Late is after that without "shipped".
 */
export function shipByDate(acceptedAt: Date, handlingDays: number[]): Date {
  const days = Math.max(1, ...handlingDays.map((n) => (Number.isFinite(n) && n >= 1 && n <= 3 ? Math.round(n) : 1)));
  const lagos = new Date(acceptedAt.getTime() + 60 * 60_000);
  const end = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() + days, 23, 59, 59);
  return new Date(end - 60 * 60_000);
}

/** Late: accepted, not shipped, past its ship-by. */
export function supplierLate(order: { status: string; shipBy?: Date | string | null }, now = new Date()) {
  return order.status === "accepted" && Boolean(order.shipBy) && new Date(order.shipBy!).getTime() < now.getTime();
}

/** The customer may cancel a late supplier's part of their order for a full refund (it hasn't left yet). */
export const customerMayCancelLate = (order: { status: string; lateAt?: Date | string | null }) => order.status === "accepted" && Boolean(order.lateAt);
