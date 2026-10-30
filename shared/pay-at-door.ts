// Pay on delivery: the customer never pays the rider or the delivery company. When the parcel arrives they pay the
// SHOP, from the link sent to their WhatsApp, SMS and email or the rider's QR code (Paystack: transfer to a one-time
// account, card or USSD), split like a card order; or the shop marks it paid when the customer paid the shop another
// way (paystackStatus "offline"). Once paid, the customer gets the delivery code; the rider types it in, the app says
// Paid, and only then is the parcel handed over. So the code stays hidden, and the drop can't close, until it's paid.
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

/** The words when a pay-on-delivery parcel is about to be handed over before the shop is paid. */
export const NOT_PAID_YET = "The customer hasn't paid the shop yet. They pay with the link sent to their phone and email (or scan your QR code), then give you the code they get.";

/** Why a job can't be marked delivered yet, or null: a pay-on-delivery order the shop hasn't been paid for. */
export function payAtDoorBlock(order: DoorOrder | null | undefined, _job: { codAmount: number | null }): string | null {
  if (!order || !isPayOnDelivery(order) || CLOSED.has(order.status)) return null;
  return payAtDoorPaid(order) ? null : NOT_PAID_YET;
}

/** The delivery code the customer may see: for pay on delivery, only once the shop is paid (it's the proof). */
export function codeVisible(order: DoorOrder) {
  return !isPayOnDelivery(order) || payAtDoorPaid(order);
}
