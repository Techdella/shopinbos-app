import "server-only";
import { db } from "@/lib/db/client";
import { appBase } from "@/lib/email/compliance.server";
import { appReturnUrl } from "@/lib/sales-channels/pure";
import { appPaidCallbackUrl, type PayOutcome } from "@shared/paystack-return";
import { SELLER_PAYIN_PREFIX, confirmSellerPayIn } from "@/lib/logistics/seller-payins.server";
import { DELIVERY_FEE_PREFIX, confirmDeliveryFeePayment } from "@/lib/logistics/delivery-fee-payments.server";
import { WHOLESALE_PAY_PREFIX, confirmWholesalePayment } from "@/lib/supplier-orders/wholesale-payments.server";
import { DEBT_PAYMENT_PREFIX, confirmDebtPayment } from "@/lib/money-owed/money-owed.server";
import { PRINT_ORDER_REFERENCE_PREFIX } from "@shared/print-orders";
import { completePrintOrderPayment } from "@/lib/packaging/print-orders.server";
import { AD_SETUP_REFERENCE_PREFIX } from "@shared/ad-campaigns";
import { completeAdSetupPayment } from "@/lib/ad-campaigns/requests.server";

// Paystack payments the phone app starts (shared/paystack-return.ts): where Paystack sends the payer back, and one
// confirm for every kind the app can pay. Each confirm asks Paystack itself (never the browser) and applies a
// reference once, the same functions the webhook runs, so the return page, the app and the webhook can all call it.

/** Paystack's callback for a payment the app started with ?app=<its return address>, or undefined (the web page). */
export function appCallbackUrl(app: unknown): string | undefined {
  const safe = typeof app === "string" ? appReturnUrl(app) : null;
  return safe ? appPaidCallbackUrl(appBase(), safe) : undefined;
}

/** The kinds of payment the app can start, by their reference prefix. */
export const APP_PAYMENT_PREFIXES = [SELLER_PAYIN_PREFIX, DELIVERY_FEE_PREFIX, WHOLESALE_PAY_PREFIX, DEBT_PAYMENT_PREFIX, PRINT_ORDER_REFERENCE_PREFIX, AD_SETUP_REFERENCE_PREFIX] as const;

export const isAppPaymentReference = (reference: string) => APP_PAYMENT_PREFIXES.some((prefix) => reference.startsWith(prefix));

export interface AppPaymentResult {
  outcome: PayOutcome;
  message?: string;
}

type Confirmed = { ok: true } | { ok: false; error: string; retry?: boolean; pending?: boolean };

function fromConfirm(result: Confirmed): AppPaymentResult {
  if (result.ok) return { outcome: "paid" };
  // Paystack couldn't be asked (retry) or the money is still moving: the webhook finishes it.
  return { outcome: result.retry || result.pending ? "pending" : "cancelled", message: result.error };
}

function fromComplete(status: "paid" | "failed" | "pending"): AppPaymentResult {
  return { outcome: status === "failed" ? "cancelled" : status };
}

/**
 * Confirms a phone payment once. With `userId` (the signed-in app), the payment must be theirs; without it (Paystack's
 * return page) Paystack's own record is all that's trusted, as for the webhook. Never throws.
 */
export async function confirmAppPayment(reference: string, userId?: string): Promise<AppPaymentResult> {
  try {
    if (reference.startsWith(SELLER_PAYIN_PREFIX)) {
      const partner = userId ? await db.logisticsPartner.findUnique({ where: { userId }, select: { id: true } }) : null;
      if (userId && !partner) return { outcome: "cancelled", message: "This payment belongs to someone else." };
      return fromConfirm(await confirmSellerPayIn(reference, partner?.id));
    }
    if (reference.startsWith(DELIVERY_FEE_PREFIX)) return fromConfirm(await confirmDeliveryFeePayment(reference, userId));
    if (reference.startsWith(WHOLESALE_PAY_PREFIX)) return fromConfirm(await confirmWholesalePayment(reference, userId));
    if (reference.startsWith(DEBT_PAYMENT_PREFIX)) return fromConfirm(await confirmDebtPayment(reference, userId));
    if (reference.startsWith(PRINT_ORDER_REFERENCE_PREFIX)) {
      if (userId && !(await db.printOrder.count({ where: { paymentRef: reference, userId } }))) return { outcome: "cancelled", message: "This payment belongs to someone else." };
      return fromComplete(await completePrintOrderPayment(reference));
    }
    if (reference.startsWith(AD_SETUP_REFERENCE_PREFIX)) {
      if (userId && !(await db.adServiceRequest.count({ where: { paymentRef: reference, userId } }))) return { outcome: "cancelled", message: "This payment belongs to someone else." };
      return fromComplete(await completeAdSetupPayment(reference));
    }
    return { outcome: "cancelled", message: "This isn't a payment the app knows." };
  } catch (error) {
    console.error(`[app payments] could not confirm ${reference}`, error);
    return { outcome: "pending" };
  }
}
