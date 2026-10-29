// Guided refunds. Shopinbos never holds money: every payment settles straight to each business's own bank
// (src/lib/wallet), so the part of a refund the seller owes (who pays is shared/fault-matrix.ts) comes from their bank.
// The customer gives a bank account on their order page (checked with the bank, so the name shows), the seller sends
// the amount and taps "Refund sent", and the customer confirms it arrived or says it didn't (the team then steps in).
// Pure, unit-tested in tests/order-refunds.test.mjs.

export const REFUND_STATUSES = ["awaiting_account", "to_send", "sent", "confirmed", "disputed", "cancelled"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_REASONS = ["out_of_stock", "supplier_late", "wrong_item", "damaged", "damaged_in_transit", "customer_unreachable", "returned", "cancelled", "late_payment", "other"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export type RefundFault = "seller" | "supplier" | "partner" | "none";

/** What the customer is told the refund is for. */
export const REFUND_REASON_TEXT: Record<RefundReason, string> = {
  out_of_stock: "Part of your order was out of stock",
  supplier_late: "Your order was late and you cancelled it",
  wrong_item: "You were sent the wrong item",
  damaged: "Your item arrived damaged",
  damaged_in_transit: "Your item was damaged on the way",
  customer_unreachable: "We couldn't deliver your order",
  returned: "You returned your order",
  cancelled: "Your order was cancelled",
  late_payment: "Your payment arrived after the order closed",
  other: "Your order",
};

/** Days before the seller is reminded to send a refund the customer gave their account for. */
export const REFUND_SEND_DAYS = 2;
/** Days after "Refund sent" before it counts as received when the customer says nothing. */
export const REFUND_CONFIRM_DAYS = 7;

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

/** The refund reason for a fault event (shared/fault-matrix.ts FAULT_EVENTS). */
export function refundReasonForFault(event: string | null | undefined): RefundReason {
  switch (event) {
    case "out_of_stock":
      return "out_of_stock";
    case "shipped_late":
      return "supplier_late";
    case "wrong_item":
      return "wrong_item";
    case "damaged_in_transit":
      return "damaged_in_transit";
    case "customer_unreachable":
    case "pod_refused":
      return "customer_unreachable";
    case "changed_mind":
      return "returned";
    default:
      return "other";
  }
}

/** Who pays the seller back for a fault event, as the seller's refund card says it. */
export function refundFaultFor(event: string | null | undefined): RefundFault {
  if (event === "out_of_stock" || event === "shipped_late" || event === "wrong_item") return "supplier";
  if (event === "damaged_in_transit") return "partner";
  return "none";
}
