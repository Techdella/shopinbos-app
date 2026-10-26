import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { appBase } from "@/lib/email/compliance.server";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { paystackOutcome } from "@shared/paystack-return";
import { createNotification } from "@/lib/notifications/create";
import { buildSplitPlan, paystackSplitParams } from "@/lib/wallet/rules";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { logisticsJobFee } from "@shared/platform-pricing";
import { planOfUser } from "@/lib/plan-limits";
import { applyDeductions, debtsToDeduct, holdPlannedDeductions, readDeductions } from "@/lib/money-owed/money-owed.server";

// A seller pays a delivery partner's fee by card in Shopinbos. Paystack splits it all to the partner's Shopinbos
// Wallet subaccount (src/lib/wallet), so it settles straight to the partner's bank; Shopinbos keeps only the job fee
// for the partner's plan (shared/plans.ts; 0% until it is switched on in Admin › Pricing) and never holds the rest. The transaction is started here with the booking in its metadata, and only Paystack's verified
// reply marks the fee paid (the popup and the webhook both call confirm; the booking is updated once). When the
// partner has overdue money owed (src/lib/money-owed), part of the fee is split to whoever it's owed to instead.

/** Paystack references for delivery-fee payments, so the webhook can tell them from store orders. */
export const DELIVERY_FEE_PREFIX = "delpay-";

const UNPAYABLE_STATUSES = ["cancelled", "failed"] as const;

/** Bookings among these whose fee the seller can pay now: unpaid, not cancelled, and the partner's wallet is ready. */
export async function payableDeliveryFees(bookingIds: string[]): Promise<Set<string>> {
  if (!bookingIds.length) return new Set();
  const bookings = await db.deliveryBooking.findMany({
    where: { id: { in: bookingIds }, feePaidAt: null, deliveryFee: { gt: 0 }, status: { notIn: [...UNPAYABLE_STATUSES] } },
    select: { id: true, logisticsPartner: { select: { userId: true } } },
  });
  const wallets = await db.wallet.findMany({
    where: { userId: { in: [...new Set(bookings.map((booking) => booking.logisticsPartner.userId))] }, status: "active", subaccountStatus: "active", subaccountCode: { not: null } },
    select: { userId: true },
  });
  const ready = new Set(wallets.map((wallet) => wallet.userId));
  return new Set(bookings.filter((booking) => ready.has(booking.logisticsPartner.userId)).map((booking) => booking.id));
}

/** callbackUrl: where Paystack sends the payer back (the phone app passes shared/paystack-return appPaidCallbackUrl). */
export type StartOptions = { callbackUrl?: string };

export type StartResult = { ok: true; accessCode: string; reference: string; authorizationUrl: string | null } | { ok: false; error: string };

/** Starts the Paystack payment of this booking's delivery fee, split straight to the partner's bank. */
export async function startDeliveryFeePayment(seller: { id: string; email: string | null }, bookingId: string, options: StartOptions = {}): Promise<StartResult> {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return { ok: false, error: "Card payments aren't set up yet. Pay the delivery partner directly for now." };
  const booking = await db.deliveryBooking.findFirst({
    where: { id: bookingId, sellerId: seller.id },
    select: { id: true, deliveryFee: true, currency: true, status: true, feePaidAt: true, logisticsPartnerId: true, logisticsPartner: { select: { userId: true, displayName: true } } },
  });
  if (!booking) return { ok: false, error: "We couldn't find this delivery." };
  if (booking.feePaidAt) return { ok: false, error: "This delivery is already paid." };
  if ((UNPAYABLE_STATUSES as readonly string[]).includes(booking.status)) return { ok: false, error: "This delivery was cancelled, so there's nothing to pay." };
  if (booking.currency !== "NGN" || booking.deliveryFee <= 0) return { ok: false, error: "This delivery can't be paid by card." };
  const wallet = await db.wallet.findFirst({ where: { userId: booking.logisticsPartner.userId, status: "active", subaccountStatus: "active" }, select: { subaccountCode: true } });
  if (!wallet?.subaccountCode) return { ok: false, error: `${booking.logisticsPartner.displayName} hasn't set up their Shopinbos Wallet yet, so pay them directly.` };
  const reference = `${DELIVERY_FEE_PREFIX}${randomBytes(9).toString("hex")}`;
  // The partner's subaccount gets it all less the job fee (the partner bears Paystack's fee), and less any overdue
  // money the partner owes, which goes to the business it's owed to.
  const amountKobo = Math.round(booking.deliveryFee * 100);
  const jobFee = logisticsJobFee(await getPriceBook(), await planOfUser(booking.logisticsPartner.userId));
  const debts = await debtsToDeduct(new Map([[booking.logisticsPartner.userId, "seller"]]), "paystack");
  const plan = buildSplitPlan({ totalKobo: amountKobo, sellerSubaccount: wallet.subaccountCode, suppliers: [], debts, platformKobo: Math.round((amountKobo * jobFee.effectiveRate) / 100) });
  const deductions = plan.deductions ?? [];
  await holdPlannedDeductions(`delivery:${booking.id}`, deductions, null);
  try {
    const started = await initializePaystackTransaction({
      email: seller.email || "deliveries@shopinbos.com",
      amountKobo,
      reference,
      callbackUrl: options.callbackUrl ?? `${appBase()}/home/logistics`,
      metadata: { kind: "delivery_fee", bookingId: booking.id, sellerId: seller.id, partnerId: booking.logisticsPartnerId, jobFeeKobo: plan.sellerKobo < amountKobo ? amountKobo - plan.sellerKobo - deductions.reduce((sum, d) => sum + d.kobo, 0) : 0, ...(deductions.length ? { deductions } : {}) },
      split: paystackSplitParams(plan),
    });
    if (!started.access_code) return { ok: false, error: "Paystack couldn't start this payment. Try again." };
    return { ok: true, accessCode: started.access_code, reference: started.reference ?? reference, authorizationUrl: started.authorization_url ?? null };
  } catch (error) {
    console.error(`[delivery fees] could not start a payment for booking ${booking.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

export type ConfirmResult = { ok: true; fresh: boolean } | { ok: false; error: string; retry?: boolean; pending?: boolean };

function readMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Marks a booking's delivery fee paid, once: asks Paystack (never the browser or the webhook body), checks it
 * succeeded, was for this booking (and seller, from the popup) and covered the fee, then records it on the booking
 * and the partner's wallet statement. Safe from the popup and the webhook at the same time.
 */
export async function confirmDeliveryFeePayment(reference: string, expectedSellerId?: string): Promise<ConfirmResult> {
  if (!reference.startsWith(DELIVERY_FEE_PREFIX)) return { ok: false, error: "Not a delivery-fee payment." };
  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  // Still on its way (a transfer or USSD) is "pending"; the webhook finishes it.
  if (payment.status !== "success") return { ok: false, error: "The payment didn't go through.", pending: paystackOutcome(payment.status) === "pending" };
  if (payment.currency && payment.currency !== "NGN") return { ok: false, error: "This payment wasn't in naira." };
  const meta = readMetadata(payment.metadata);
  const bookingId = typeof meta.bookingId === "string" ? meta.bookingId : "";
  if (meta.kind !== "delivery_fee" || !bookingId) return { ok: false, error: "This payment isn't a delivery fee." };
  if (expectedSellerId && meta.sellerId !== expectedSellerId) return { ok: false, error: "This payment belongs to another seller." };

  const booking = await db.deliveryBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, sellerId: true, deliveryFee: true, feePaymentRef: true, trackingCode: true, destination: true, logisticsPartner: { select: { userId: true } } },
  });
  if (!booking) return { ok: false, error: "We couldn't find this delivery." };
  if (booking.feePaymentRef === reference) return { ok: true, fresh: false };
  const paidKobo = Math.round(Number(payment.amount));
  if (paidKobo + 0.5 < Math.round(booking.deliveryFee * 100)) {
    console.warn(`[delivery fees] ${reference} paid ${paidKobo} kobo, less than the fee of booking ${booking.id}`);
    return { ok: false, error: "The amount paid is less than the delivery fee." };
  }

  // What Shopinbos kept (the job fee for the partner's plan, set when the payment started) goes on the booking.
  const jobFeeNaira = Math.max(0, Math.round(Number(meta.jobFeeKobo) || 0)) / 100;
  const moved = await db.deliveryBooking.updateMany({
    where: { id: booking.id, feePaidAt: null },
    data: { feePaidAt: new Date(), feePaymentRef: reference, platformFee: jobFeeNaira, netAmount: Math.max(0, booking.deliveryFee - jobFeeNaira), feeBearer: "logistics_partner" },
  });
  if (moved.count !== 1) {
    // Already paid: by this payment (raced with the other caller) or by another one, which the seller should get back.
    const now = await db.deliveryBooking.findUnique({ where: { id: booking.id }, select: { feePaymentRef: true } });
    if (now?.feePaymentRef === reference) return { ok: true, fresh: false };
    console.warn(`[delivery fees] booking ${booking.id} was paid twice: ${now?.feePaymentRef} and ${reference}`);
    return { ok: false, error: "This delivery was already paid. Ask the delivery partner to send the second payment back." };
  }

  const wallet = await db.wallet.findUnique({ where: { userId: booking.logisticsPartner.userId }, select: { id: true } });
  const label = booking.trackingCode ? `Delivery ${booking.trackingCode}` : `Delivery to ${booking.destination}`;
  const deductions = readDeductions(meta.deductions);
  const deductedKobo = deductions.reduce((sum, row) => sum + row.kobo, 0);
  if (deductions.length) await applyDeductions({ key: `delivery:${booking.id}`, deductions, label: `the delivery fee for ${booking.trackingCode ?? booking.destination}`, paystackReference: reference, retailOrderId: null });
  if (wallet) {
    await db.walletEntry
      .createMany({ data: [{ walletId: wallet.id, reference: `delivery:${booking.id}`, kind: "delivery_fee", amountKobo: paidKobo - deductedKobo, description: label, paystackReference: reference }], skipDuplicates: true })
      .catch((error) => console.error(`[delivery fees] could not record booking ${booking.id} on the partner's wallet`, error));
  }
  await createNotification({ userId: booking.logisticsPartner.userId, type: "order", priority: "info", title: "Delivery fee paid", description: `${label} was paid by card: ₦${((paidKobo - deductedKobo) / 100).toLocaleString("en-NG")}${deductedKobo ? " after what you owe" : ""}. It goes straight to your bank.`, link: "/logistics/wallet", event: "payin.received" }).catch(() => null);
  return { ok: true, fresh: true };
}
