// Pay on delivery without cash: the customer checks the parcel at the door, pays in the app (Paystack: transfer to
// a one-time account, card or USSD), and only then sees the 4-digit delivery code the rider types to close the drop.
// No code, no drop: the rider app can't mark a pay-on-delivery order delivered until the money is in. Riders never
// hold cash. Pure, unit-tested in tests/pay-at-door.test.mjs; the payment itself is src/lib/commerce/pay-at-door.server.ts.
//
// The delivery fee is paid at checkout (POD_FEE_PREFIX), settled straight to the delivery partner (or the seller for
// their own delivery), so a customer who won't pay at the door has still paid for the trip. Until it's in, the order
// waits (paymentDueAt is set, the card window) and expires like an unpaid card order; once it's in (depositPaidAt) the
// order is confirmed, sent to suppliers and booked, and the door payment is the rest (total less the fee). Orders with
// free delivery have nothing to pay upfront and go live straight away, as before.
//
// An order is "paid at the door" once the Paystack payment is verified (paystackStatus "success"), or the seller
// marked it paid before it left (paystackStatus "offline", or status "paid"). Jobs from before this change that still
// carry a cash amount (codAmount) close the old way, with the cash recorded, so nothing in flight gets stuck.

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
 * Why a job can't be marked delivered yet, or null. A pay-on-delivery order must be paid first, whoever closes the
 * drop (rider, partner portal or API). Old cash jobs (codAmount set) are exempt: they record the cash instead.
 */
export function payAtDoorBlock(order: DoorOrder | null | undefined, job: { codAmount: number | null }) {
  if (!order || !payAtDoorDue(order) || (job.codAmount ?? 0) > 0) return null;
  return "The customer hasn't paid yet. Ask them to pay with the link on their phone (or scan the QR code in your app). Once the money is in they get the code to give you.";
}

/** The delivery code the customer may see: only once a pay-on-delivery order is paid. */
export function codeVisible(order: DoorOrder) {
  return !isPayOnDelivery(order) || payAtDoorPaid(order);
}
