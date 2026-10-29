// Pay on delivery is the seller's own arrangement with their customer and their delivery people (Shopinbos only
// provides the platform: shared/checkout-payments.ts PAY_ON_DELIVERY_ON). The customer pays the seller or their rider at
// the door, by cash or transfer as they agree, and the seller marks the order paid (paystackStatus "offline"); or the
// customer pays in the app from their order page (Paystack: transfer to a one-time account, card or USSD), split like
// a card order. Shopinbos sets no rider rules: a drop isn't held for payment and the delivery code isn't hidden.
// Pure, unit-tested in tests/pay-at-door.test.mjs; the in-app payment is src/lib/commerce/pay-at-door.server.ts.
//
// When the store takes card payments, the delivery fee can be paid at checkout (POD_FEE_PREFIX), settled straight to
// the delivery partner (or the seller for their own delivery). Until it's in, the order waits (paymentDueAt) and expires
// like an unpaid card order; once it's in (depositPaidAt) the order is confirmed and the rest is paid at the door.
// Stores without card payments, and free delivery, have nothing to pay upfront and go live straight away.
//
// An order is "paid" once an in-app payment is verified (paystackStatus "success"), or the seller marked it paid
// (paystackStatus "offline", or status "paid").

/** Paystack references for door payments (the webhook and the order page route them here). */
export const PAY_AT_DOOR_PREFIX = "pdoor_";

/** Paystack references for the delivery fee paid at checkout. */
export const POD_FEE_PREFIX = "pdfee_";

/** How long the rider waits at the door for the payment before taking the parcel back. */
export const PAY_AT_DOOR_WAIT_MINUTES = 10;

/** Paystack channels offered at the door: a one-time account for a transfer, card, USSD. */
export const PAY_AT_DOOR_CHANNELS = ["bank_transfer", "card", "ussd"] as const;

const CLOSED = new Set(["cancelled", "delivered", "returned", "refunded", "partially_refunded"]);

export type DoorOrder = { paymentMethod: string | null; status: string; paystackStatus?: string | null };

export function isPayOnDelivery(order: Pick<DoorOrder, "paymentMethod">) {
  return order.paymentMethod === "pay_on_delivery";
}

export type FeeOrder = DoorOrder & { paymentDueAt?: Date | string | null; depositPaidAt?: Date | string | null };

/** What's charged at checkout for a pay-on-delivery order, in kobo: the delivery fee (0 when delivery is free). */
export function podFeeKobo(shippingFee: number | null | undefined) {
  return Math.max(0, Math.round(Number(shippingFee ?? 0) * 100));
}

/** The delivery fee is paid (at checkout). */
export function podFeePaid(order: FeeOrder) {
  return isPayOnDelivery(order) && Boolean(order.depositPaidAt);
}

/** Waiting for the delivery fee: placed, not paid, not expired. Nothing is sent or booked until it's in. */
export function podFeeDue(order: FeeOrder) {
  return isPayOnDelivery(order) && !order.depositPaidAt && Boolean(order.paymentDueAt) && (order.status === "pending" || order.status === "awaiting_payment");
}

/**
 * What the customer pays at the door, in kobo: the order total, less the delivery fee when it was paid at checkout
 * (`feeKobo`: what that payment was for, its split's total).
 */
export function doorAmountKobo(order: { total: number; depositPaidAt?: Date | string | null }, feeKobo: number) {
  const total = Math.max(0, Math.round(Number(order.total) * 100));
  return order.depositPaidAt ? Math.max(0, total - Math.max(0, Math.round(feeKobo))) : total;
}

/** The customer has paid a pay-on-delivery order (in the app, or the seller marked it paid). */
export function payAtDoorPaid(order: DoorOrder) {
  return isPayOnDelivery(order) && (order.paystackStatus === "success" || order.paystackStatus === "offline" || order.status === "paid");
}

/** Still to pay at the door: a pay-on-delivery order that's open and not paid. */
export function payAtDoorDue(order: FeeOrder) {
  return isPayOnDelivery(order) && !payAtDoorPaid(order) && !CLOSED.has(order.status) && !podFeeDue(order);
}

/**
 * Why a job can't be marked delivered yet, or null. Never for payment: how the customer pays at the door is between
 * the seller, their customer and their rider, so Shopinbos doesn't hold a drop for it.
 */
export function payAtDoorBlock(_order: DoorOrder | null | undefined, _job: { codAmount: number | null }): string | null {
  return null;
}

/** The delivery code the customer may see: always (it proves who received the parcel, not that it's paid). */
export function codeVisible(_order: DoorOrder) {
  return true;
}
